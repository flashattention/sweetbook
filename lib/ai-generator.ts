import OpenAI from "openai";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	type ImageModel,
	type StoryModel,
} from "@/lib/ai-pricing";

export type BookKind = "COMIC" | "NOVEL";
export type ComicStyle = "MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK";

export interface GenerateBookInput {
	title: string;
	characters: string;
	genre: string;
	description: string;
	pageCount: number;
	bookKind: BookKind;
	comicStyle?: ComicStyle;
}

export interface GenerateBookOutput {
	tagline: string;
	synopsis: string;
	characterProfiles: string[];
	chapters: Array<{ title: string; summary: string }>;
	pages: Array<{
		pageOrder: number;
		caption: string;
		imagePrompt?: string;
		dialogues?: string[];
		shotDirection?: string;
	}>;
	actualUsage: { inputTokens: number; outputTokens: number };
}

export class MissingOpenAIKeyError extends Error {
	constructor() {
		super(
			"OPENAI_API_KEY가 없습니다. .env에 OPENAI_API_KEY를 설정해주세요.",
		);
		this.name = "MissingOpenAIKeyError";
	}
}

function isOpenAIQuotaExceededError(error: unknown): boolean {
	const e = error as {
		status?: number;
		code?: string;
		error?: { code?: string; message?: string };
		message?: string;
	};

	const status = Number(e?.status);
	const code = String(e?.code || e?.error?.code || "").toLowerCase();
	const message = String(e?.message || e?.error?.message || "").toLowerCase();

	return (
		status === 429 &&
		(code.includes("insufficient_quota") ||
			message.includes("insufficient_quota") ||
			message.includes("current quota") ||
			message.includes("quota exceeded"))
	);
}

interface ComicImageCheckpoint {
	version: 1;
	coverImageUrl?: string;
	pageImageUrlsByOrder: Record<number, string>;
	updatedAt: string;
}

function getOpenAIClient() {
	if (!process.env.OPENAI_API_KEY) {
		throw new MissingOpenAIKeyError();
	}
	return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getCheckpointPath(checkpointKey?: string): string | null {
	if (!checkpointKey) {
		return null;
	}
	const safeKey = checkpointKey.replace(/[^a-zA-Z0-9_-]/g, "_");
	return path.join(
		process.cwd(),
		".cache",
		"comic-checkpoints",
		`${safeKey}.json`,
	);
}

async function readComicImageCheckpoint(
	checkpointKey?: string,
): Promise<ComicImageCheckpoint | null> {
	const checkpointPath = getCheckpointPath(checkpointKey);
	if (!checkpointPath) {
		return null;
	}

	try {
		const raw = await readFile(checkpointPath, "utf8");
		const parsed = JSON.parse(raw) as Partial<ComicImageCheckpoint>;
		if (parsed.version !== 1) {
			return null;
		}
		return {
			version: 1,
			coverImageUrl:
				typeof parsed.coverImageUrl === "string"
					? parsed.coverImageUrl
					: undefined,
			pageImageUrlsByOrder:
				parsed.pageImageUrlsByOrder &&
				typeof parsed.pageImageUrlsByOrder === "object"
					? (parsed.pageImageUrlsByOrder as Record<number, string>)
					: {},
			updatedAt:
				typeof parsed.updatedAt === "string"
					? parsed.updatedAt
					: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

async function writeComicImageCheckpoint(params: {
	checkpointKey?: string;
	data: ComicImageCheckpoint;
}) {
	const checkpointPath = getCheckpointPath(params.checkpointKey);
	if (!checkpointPath) {
		return;
	}

	await mkdir(path.dirname(checkpointPath), { recursive: true });
	await writeFile(checkpointPath, JSON.stringify(params.data), "utf8");
}

async function clearComicImageCheckpoint(checkpointKey?: string) {
	const checkpointPath = getCheckpointPath(checkpointKey);
	if (!checkpointPath) {
		return;
	}

	await rm(checkpointPath, { force: true }).catch(() => {});
}

async function persistGeneratedImage(params: {
	image: { url?: string | null; b64_json?: string | null };
	prefix: string;
}): Promise<string> {
	const uploadsDir = path.join(process.cwd(), "public", "uploads");
	if (!existsSync(uploadsDir)) {
		await mkdir(uploadsDir, { recursive: true });
	}

	const fileName = `${params.prefix}-${uuidv4()}.png`;
	const outputPath = path.join(uploadsDir, fileName);

	if (params.image.b64_json) {
		await writeFile(
			outputPath,
			Buffer.from(params.image.b64_json, "base64"),
		);
		return `/uploads/${fileName}`;
	}

	if (params.image.url) {
		const res = await fetch(params.image.url);
		if (!res.ok) {
			throw new Error(`이미지 다운로드 실패: ${res.status}`);
		}
		const data = Buffer.from(await res.arrayBuffer());
		await writeFile(outputPath, data);
		return `/uploads/${fileName}`;
	}

	throw new Error(
		"OpenAI 이미지 응답에서 URL 또는 base64 데이터를 찾을 수 없습니다.",
	);
}

function clampNovelPageText(text: string): string {
	const trimmed = String(text || "").trim();
	if (!trimmed) {
		return "장면이 이어지는 다음 사건이 펼쳐진다.";
	}
	return trimmed;
}

function isNovelPageLengthPreferred(text: string): boolean {
	const length = String(text || "").trim().length;
	return length >= 800 && length <= 1200;
}

export async function generateBookPlan(
	input: GenerateBookInput,
	options?: {
		storyModel?: StoryModel;
		onNovelPageDone?: (
			doneCount: number,
			totalCount: number,
			usage: { inputTokens: number; outputTokens: number },
		) => Promise<void> | void;
	},
): Promise<GenerateBookOutput> {
	const client = getOpenAIClient();
	const model = options?.storyModel || DEFAULT_STORY_MODEL;
	const usageCounter = {
		inputTokens: 0,
		outputTokens: 0,
	};

	const callJsonObject = async (params: {
		prompt: string;
		temperature?: number;
	}) => {
		const response = await client.chat.completions.create({
			model,
			temperature: params.temperature ?? 0.7,
			response_format: { type: "json_object" },
			messages: [{ role: "user", content: params.prompt }],
		});

		usageCounter.inputTokens += response.usage?.prompt_tokens ?? 0;
		usageCounter.outputTokens += response.usage?.completion_tokens ?? 0;

		const raw = response.choices[0]?.message?.content;
		if (!raw) {
			throw new Error("OpenAI에서 생성 결과를 받지 못했습니다.");
		}

		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch (error) {
			console.error("[generateBookPlan] parse error", error, raw);
			throw new Error(
				"OpenAI 응답 파싱에 실패했습니다. 모델 출력 형식을 확인해주세요.",
			);
		}
	};

	if (input.bookKind === "NOVEL") {
		const outlinePrompt = [
			"너는 장편 아동/청소년 소설 기획 에디터다.",
			"반드시 JSON만 출력하라.",
			`제목: ${input.title}`,
			`등장인물: ${input.characters}`,
			`장르: ${input.genre}`,
			`요청 내용: ${input.description}`,
			`총 페이지 수: ${input.pageCount}`,
			"출력 키는 tagline, synopsis, characterProfiles, chapters, pageBlueprints를 사용하라.",
			"chapters는 [{title, summary}] 배열.",
			"pageBlueprints는 페이지 수와 동일한 길이의 배열로 [{pageOrder, beat, emotion, keyDetail}] 형식.",
			"pageBlueprints는 페이지 간 사건이 반드시 이어지도록 설계하라.",
			"각 beat는 1~2문장으로 간결하게 작성하라.",
		].join("\n");

		const outline = await callJsonObject({
			prompt: outlinePrompt,
			temperature: 0.65,
		});

		const tagline = String(outline.tagline || input.title);
		const synopsis = String(outline.synopsis || input.description);
		const characterProfiles = Array.isArray(outline.characterProfiles)
			? outline.characterProfiles
					.map((v) => String(v || ""))
					.filter(Boolean)
			: [];
		const chapters = Array.isArray(outline.chapters)
			? outline.chapters.map((c, i) => {
					const item = c as { title?: unknown; summary?: unknown };
					return {
						title: String(item.title || `${i + 1}장`),
						summary: String(item.summary || ""),
					};
				})
			: [];
		const rawBlueprints = Array.isArray(outline.pageBlueprints)
			? outline.pageBlueprints
			: [];
		const pageBlueprints = Array.from({ length: input.pageCount }).map(
			(_, idx) => {
				const candidate = rawBlueprints[idx] as
					| {
							beat?: unknown;
							emotion?: unknown;
							keyDetail?: unknown;
					  }
					| undefined;
				return {
					pageOrder: idx + 1,
					beat: String(candidate?.beat || `${idx + 1}페이지 사건`),
					emotion: String(candidate?.emotion || ""),
					keyDetail: String(candidate?.keyDetail || ""),
				};
			},
		);

		await options?.onNovelPageDone?.(0, input.pageCount, {
			inputTokens: usageCounter.inputTokens,
			outputTokens: usageCounter.outputTokens,
		});

		const pages: Array<{ pageOrder: number; caption: string }> = [];
		for (let idx = 0; idx < input.pageCount; idx++) {
			const pageOrder = idx + 1;
			const blueprint = pageBlueprints[idx];
			const prevPageText = pages[idx - 1]?.caption || "";
			const prevPrevPageText = pages[idx - 2]?.caption || "";

			const chapterHint =
				chapters.length > 0
					? chapters[
							Math.floor(
								(idx / input.pageCount) * chapters.length,
							)
						]
					: null;

			const pagePrompt = [
				"너는 소설 집필 AI다. 반드시 JSON만 출력하라.",
				'출력 형식: {"caption": "..."}',
				`제목: ${input.title}`,
				`장르: ${input.genre}`,
				`전체 줄거리: ${synopsis}`,
				`등장인물 설정: ${characterProfiles.join(" | ")}`,
				chapterHint
					? `현재 챕터 힌트: ${chapterHint.title} / ${chapterHint.summary}`
					: "",
				`현재 페이지: ${pageOrder}/${input.pageCount}`,
				`이번 페이지 사건: ${blueprint.beat}`,
				blueprint.emotion ? `감정 톤: ${blueprint.emotion}` : "",
				blueprint.keyDetail
					? `반드시 포함할 디테일: ${blueprint.keyDetail}`
					: "",
				prevPrevPageText
					? `이전 2페이지 내용: ${prevPrevPageText}`
					: "",
				prevPageText ? `직전 페이지 내용: ${prevPageText}` : "",
				"규칙: 1) 반드시 한국어 소설 문단 하나만 작성한다.",
				"규칙: 2) 1000자 내외로 작성하되, 가능하면 800~1200자 범위를 맞춘다.",
				"규칙: 3) 직전 페이지와 사건/감정이 자연스럽게 이어져야 한다.",
				"규칙: 4) 다음 페이지로 넘어갈 여지를 남긴다.",
				"규칙: 5) 목록/마크다운/따옴표 감싼 JSON 이외 텍스트 금지.",
			]
				.filter(Boolean)
				.join("\n");

			let pageCaption = "";
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					const pageResult = await callJsonObject({
						prompt: pagePrompt,
						temperature: 0.6,
					});
					pageCaption = clampNovelPageText(
						String(pageResult.caption || "").trim(),
					);
					if (pageCaption) {
						break;
					}
				} catch (error) {
					if (attempt === 1) {
						throw error;
					}
				}
			}

			if (!pageCaption) {
				pageCaption = clampNovelPageText(
					`${blueprint.beat} ${blueprint.emotion}`.trim(),
				);
			}

			if (!isNovelPageLengthPreferred(pageCaption)) {
				const strengthenPrompt = [
					"너는 소설 집필 AI다. 반드시 JSON만 출력하라.",
					'출력 형식: {"caption": "..."}',
					`제목: ${input.title}`,
					`장르: ${input.genre}`,
					`전체 줄거리: ${synopsis}`,
					`현재 페이지: ${pageOrder}/${input.pageCount}`,
					`이번 페이지 사건: ${blueprint.beat}`,
					prevPageText ? `직전 페이지 내용: ${prevPageText}` : "",
					`초안: ${pageCaption}`,
					"요청: 초안을 확장/보강해 1000자 내외(권장 800~1200자)의 자연스러운 소설 본문으로 다시 작성하라.",
					"요청: 사건 연결성과 감정 흐름을 유지하고, 다음 페이지로 이어지는 여운을 남겨라.",
				]
					.filter(Boolean)
					.join("\n");

				try {
					const strengthenedResult = await callJsonObject({
						prompt: strengthenPrompt,
						temperature: 0.55,
					});
					const strengthenedCaption = clampNovelPageText(
						String(strengthenedResult.caption || "").trim(),
					);
					if (strengthenedCaption) {
						pageCaption = strengthenedCaption;
					}
				} catch {
					// Keep original pageCaption on strengthen failure.
				}
			}

			pages.push({ pageOrder, caption: pageCaption });
			await options?.onNovelPageDone?.(pages.length, input.pageCount, {
				inputTokens: usageCounter.inputTokens,
				outputTokens: usageCounter.outputTokens,
			});
		}

		return {
			tagline,
			synopsis,
			characterProfiles,
			chapters,
			pages,
			actualUsage: {
				inputTokens: usageCounter.inputTokens,
				outputTokens: usageCounter.outputTokens,
			},
		};
	}

	const prompt = [
		"너는 출판 기획 에디터다.",
		`책 종류: ${input.bookKind}`,
		input.bookKind === "COMIC"
			? `만화 스타일: ${input.comicStyle || "MANGA"}`
			: "",
		`제목: ${input.title}`,
		`등장인물: ${input.characters}`,
		`장르: ${input.genre}`,
		`요청 내용: ${input.description}`,
		`페이지 수: ${input.pageCount}`,
		"반드시 JSON만 출력하고 키는 tagline, synopsis, characterProfiles, chapters, pages를 사용하라.",
		"chapters는 [{title, summary}] 배열, pages는 [{pageOrder, caption, imagePrompt, dialogues, shotDirection}] 배열로 구성하라.",
		"pages 길이는 반드시 요청한 페이지 수와 같아야 한다.",
	]
		.filter(Boolean)
		.join("\n");

	const characterConsistencyNote =
		input.bookKind === "COMIC"
			? [
					"각 페이지의 imagePrompt에는 등장인물의 외형(헤어 색상, 의상, 체형, 소품)을 반드시 상세히 포함시켜라.",
					"모든 페이지에서 동일 캐릭터는 외형 묘사가 일치해야 한다.",
					"각 페이지는 구도가 반복되지 않도록 shotDirection에 서로 다른 샷 타입을 넣어라. 예: establishing shot, medium shot, close-up, over-shoulder, low angle, top-down.",
					"각 페이지의 dialogues는 1~2개의 짧은 한국어 대사로 작성하라.",
					"dialogues는 말풍선에 넣을 실제 문장이어야 하며, 장면 감정과 행동을 드러내야 한다.",
				].join(" ")
			: "";
	const fullPrompt = characterConsistencyNote
		? `${prompt}\n${characterConsistencyNote}`
		: prompt;
	const parsed = (await callJsonObject({
		prompt: fullPrompt,
		temperature: 0.7,
	})) as Partial<GenerateBookOutput>;

	try {
		if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
			throw new Error("OpenAI 응답 JSON에 pages가 비어 있습니다.");
		}
		return {
			tagline: String(parsed.tagline || input.title),
			synopsis: String(parsed.synopsis || input.description),
			characterProfiles: Array.isArray(parsed.characterProfiles)
				? parsed.characterProfiles.map((v) => String(v))
				: [],
			chapters: Array.isArray(parsed.chapters)
				? parsed.chapters.map((c, i) => ({
						title: String(c.title || `${i + 1}장`),
						summary: String(c.summary || ""),
					}))
				: [],
			pages: parsed.pages.slice(0, input.pageCount).map((p, idx) => {
				const rawDialogues = (p as { dialogues?: unknown }).dialogues;
				const normalizedDialogues = Array.isArray(rawDialogues)
					? rawDialogues
							.map((item) => String(item || "").trim())
							.filter(Boolean)
							.slice(0, 2)
					: [];

				return {
					pageOrder: idx + 1,
					caption: String(p.caption || `${idx + 1}페이지`),
					imagePrompt:
						typeof p.imagePrompt === "string"
							? p.imagePrompt
							: undefined,
					dialogues: normalizedDialogues,
					shotDirection:
						typeof (p as { shotDirection?: unknown })
							.shotDirection === "string"
							? String(
									(p as { shotDirection?: string })
										.shotDirection,
								)
							: undefined,
				};
			}),
			actualUsage: {
				inputTokens: usageCounter.inputTokens,
				outputTokens: usageCounter.outputTokens,
			},
		};
	} catch (error) {
		console.error("[generateBookPlan] parse error", error, parsed);
		throw new Error(
			"OpenAI 응답 파싱에 실패했습니다. 모델 출력 형식을 확인해주세요.",
		);
	}
}

function ensurePageDialogues(page: {
	pageOrder: number;
	caption: string;
	dialogues?: string[];
}): string[] {
	if (Array.isArray(page.dialogues) && page.dialogues.length > 0) {
		return page.dialogues
			.map((line) => String(line || "").trim())
			.filter(Boolean)
			.slice(0, 2);
	}

	const caption = String(page.caption || "").trim();
	if (!caption) {
		return ["좋아, 시작해볼까?", "이번엔 꼭 해낼 거야."];
	}

	return [caption.slice(0, 32), "좋아, 다음으로 가자."];
}

function buildCoverVisualLock(params: {
	title: string;
	synopsis: string;
	comicStyle: ComicStyle;
	characterProfiles?: string[];
}): string {
	const profiles = (params.characterProfiles || [])
		.map((profile) => String(profile || "").trim())
		.filter(Boolean)
		.slice(0, 4)
		.join(" | ");

	return [
		`Cover key art title: ${params.title}`,
		`Cover story tone: ${params.synopsis}`,
		`Style lock: ${params.comicStyle}`,
		profiles
			? `Character look lock from cover: ${profiles}`
			: "Character look lock from cover: keep face shape, hair, outfit, and key accessories consistent.",
	].join(". ");
}

function buildLowCostModelPromptBooster(params: {
	pageOrder: number;
	totalCount: number;
	dialogues: string[];
}): string {
	return [
		`Panel ${params.pageOrder}/${params.totalCount}.`,
		"Avoid generic composition and repeated poses.",
		"Use clear foreground/midground/background separation.",
		"Speech bubbles must be clearly visible and readable.",
		`Speech bubble text (Korean): ${params.dialogues.join(" / ")}`,
	].join(" ");
}

export async function generateComicImages(params: {
	title: string;
	synopsis: string;
	comicStyle: ComicStyle;
	pages: Array<{
		pageOrder: number;
		caption: string;
		imagePrompt?: string;
		dialogues?: string[];
		shotDirection?: string;
	}>;
	characterProfiles?: string[];
	imageModel?: ImageModel;
	maxParallel?: number;
	retryCount?: number;
	checkpointKey?: string;
	onPageDone?: (
		doneCount: number,
		totalCount: number,
	) => Promise<void> | void;
}): Promise<{ coverImageUrl: string; pageImageUrls: string[] }> {
	const client = getOpenAIClient();
	const imageModel = params.imageModel || DEFAULT_IMAGE_MODEL;
	const maxParallel = Math.max(1, Math.min(8, params.maxParallel || 4));
	const retryCount = Math.max(0, Math.min(3, params.retryCount ?? 2));

	const stylePrefix =
		{
			MANGA: "Japanese manga style black-and-white comic panel",
			CARTOON: "Western cartoon style colorful comic panel",
			AMERICAN: "American superhero comic style panel",
			PICTURE_BOOK: "Children's picture book illustration",
		}[params.comicStyle] ?? "comic panel illustration";

	const characterAnchor =
		params.characterProfiles && params.characterProfiles.length > 0
			? `Characters: ${params.characterProfiles.slice(0, 4).join(" | ")}.`
			: "";

	const coverPrompt = [
		stylePrefix + " cover art",
		`Title: ${params.title}`,
		`Synopsis: ${params.synopsis}`,
		characterAnchor,
		"No text, no letters on image. Vivid composition, high quality, full scene.",
	].join(". ");

	const checkpoint = (await readComicImageCheckpoint(
		params.checkpointKey,
	)) || {
		version: 1 as const,
		pageImageUrlsByOrder: {},
		updatedAt: new Date().toISOString(),
	};

	let coverImageUrl = checkpoint.coverImageUrl;
	if (!coverImageUrl) {
		const cover = await client.images.generate({
			model: imageModel,
			prompt: coverPrompt,
			size: "1024x1024",
		});

		const coverImage = cover.data?.[0];
		if (!coverImage) {
			throw new Error("OpenAI 표지 이미지 생성에 실패했습니다.");
		}

		coverImageUrl = await persistGeneratedImage({
			image: coverImage,
			prefix: "comic-cover",
		});
		checkpoint.coverImageUrl = coverImageUrl;
		checkpoint.updatedAt = new Date().toISOString();
		await writeComicImageCheckpoint({
			checkpointKey: params.checkpointKey,
			data: checkpoint,
		});
	}
	const coverVisualLock = buildCoverVisualLock({
		title: params.title,
		synopsis: params.synopsis,
		comicStyle: params.comicStyle,
		characterProfiles: params.characterProfiles,
	});

	const pageImageUrls: string[] = new Array(params.pages.length).fill("");
	const totalCount = params.pages.length;
	let doneCount = 0;
	for (let idx = 0; idx < params.pages.length; idx++) {
		const page = params.pages[idx];
		const checkpointUrl = checkpoint.pageImageUrlsByOrder[page.pageOrder];
		if (typeof checkpointUrl === "string" && checkpointUrl.trim()) {
			pageImageUrls[idx] = checkpointUrl;
			doneCount += 1;
		}
	}

	if (params.onPageDone && doneCount > 0) {
		await params.onPageDone(doneCount, totalCount);
	}

	const pendingPages = params.pages
		.map((page, idx) => ({ page, idx }))
		.filter((item) => !pageImageUrls[item.idx]);

	let cursor = 0;
	const runPageGeneration = async (item: {
		page: {
			pageOrder: number;
			caption: string;
			imagePrompt?: string;
			dialogues?: string[];
			shotDirection?: string;
		};
		idx: number;
	}) => {
		const { page, idx } = item;
		const dialogues = ensurePageDialogues(page);
		const shotDirection = String(page.shotDirection || "").trim();
		const lowCostBooster =
			params.imageModel === "dall-e-2"
				? buildLowCostModelPromptBooster({
						pageOrder: page.pageOrder,
						totalCount,
						dialogues,
					})
				: "";
		const pagePrompt = [
			stylePrefix,
			`Use the same character appearance as the already generated cover image (${coverImageUrl}).`,
			coverVisualLock,
			characterAnchor,
			shotDirection ? `Shot direction: ${shotDirection}` : "",
			page.imagePrompt || page.caption,
			`Speech bubble requirements: include exactly ${dialogues.length} readable Korean speech bubble(s).`,
			`Speech bubble text: ${dialogues.join(" / ")}`,
			"Consistent character appearance with other panels. Dynamic camera angle. Distinct composition from adjacent scenes.",
			"No watermark.",
			lowCostBooster,
		].join(". ");

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const pageImageRes = await client.images.generate({
					model: imageModel,
					prompt: pagePrompt,
					size: "1024x1024",
				});

				const image = pageImageRes.data?.[0];
				if (!image) {
					throw new Error(
						`${page.pageOrder}페이지 이미지 생성 응답이 비어 있습니다.`,
					);
				}

				const localUrl = await persistGeneratedImage({
					image,
					prefix: `comic-page-${page.pageOrder}`,
				});
				pageImageUrls[idx] = localUrl;
				checkpoint.pageImageUrlsByOrder[page.pageOrder] = localUrl;
				checkpoint.updatedAt = new Date().toISOString();
				await writeComicImageCheckpoint({
					checkpointKey: params.checkpointKey,
					data: checkpoint,
				});

				doneCount += 1;
				if (params.onPageDone) {
					await params.onPageDone(doneCount, totalCount);
				}
				return;
			} catch (error) {
				if (isOpenAIQuotaExceededError(error)) {
					throw error;
				}
				if (attempt >= retryCount) {
					throw new Error(
						`${page.pageOrder}페이지 이미지 생성 실패 (재시도 ${retryCount}회 초과): ${
							error instanceof Error
								? error.message
								: "알 수 없는 오류"
						}`,
					);
				}
			}
		}
	};

	const workers = new Array(Math.min(maxParallel, pendingPages.length))
		.fill(null)
		.map(async () => {
			while (true) {
				const current = cursor;
				cursor += 1;
				if (current >= pendingPages.length) {
					return;
				}
				await runPageGeneration(pendingPages[current]);
			}
		});

	await Promise.all(workers);

	await clearComicImageCheckpoint(params.checkpointKey);

	return { coverImageUrl, pageImageUrls };
}

export async function generateStoryCoverImage(params: {
	title: string;
	synopsis: string;
	genre?: string;
	imageModel?: ImageModel;
}): Promise<string> {
	const client = getOpenAIClient();
	const imageModel = params.imageModel || DEFAULT_IMAGE_MODEL;

	const coverPrompt = [
		"Book cover illustration",
		`Title: ${params.title}`,
		params.genre ? `Genre: ${params.genre}` : "",
		`Synopsis: ${params.synopsis}`,
		"No text, no letters on image. Clean composition, emotionally expressive, high quality.",
	]
		.filter(Boolean)
		.join(". ");

	const response = await client.images.generate({
		model: imageModel,
		prompt: coverPrompt,
		size: "1024x1024",
	});

	const image = response.data?.[0];
	if (!image) {
		throw new Error("소설 표지 이미지 생성에 실패했습니다.");
	}

	return persistGeneratedImage({
		image,
		prefix: "story-cover",
	});
}
