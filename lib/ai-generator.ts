import OpenAI from "openai";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error("Supabase env vars missing");
	return createClient(url, key);
}
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	type ImageModel,
	type StoryModel,
} from "@/lib/ai-pricing";

export type BookKind = "COMIC" | "NOVEL";
export type ComicStyle = "MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK";

export interface CharacterImageRef {
	name: string;
	imageUrl: string;
}

export interface GenerateBookInput {
	title: string;
	characters: string;
	genre: string;
	description: string;
	pageCount: number;
	bookKind: BookKind;
	comicStyle?: ComicStyle;
}

export interface NovelOutline {
	tagline: string;
	synopsis: string;
	characterProfiles: string[];
	chapters: Array<{ title: string; summary: string }>;
	pageBlueprints: Array<{
		pageOrder: number;
		beat: string;
		emotion: string;
		keyDetail: string;
	}>;
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
	/** resume 경로에서 생성된 신규 페이지만 포함 (기존 pages와 병합 필요). undefined 이면 전체 pages와 동일. */
	newPagesOnly?: boolean;
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
	const baseDir = process.env.VERCEL
		? "/tmp/comic-checkpoints"
		: path.join(process.cwd(), ".cache", "comic-checkpoints");
	return path.join(baseDir, `${safeKey}.json`);
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
	const fileName = `ai-generated/${params.prefix}-${uuidv4()}.png`;
	let buffer: Buffer;

	if (params.image.b64_json) {
		buffer = Buffer.from(params.image.b64_json, "base64");
	} else if (params.image.url) {
		const res = await fetch(params.image.url);
		if (!res.ok) {
			throw new Error(`이미지 다운로드 실패: ${res.status}`);
		}
		buffer = Buffer.from(await res.arrayBuffer());
	} else {
		throw new Error(
			"OpenAI 이미지 응답에서 URL 또는 base64 데이터를 찾을 수 없습니다.",
		);
	}

	const supabase = getSupabaseAdmin();
	const { error } = await supabase.storage
		.from("uploads")
		.upload(fileName, buffer, { contentType: "image/png", upsert: false });

	if (error) {
		throw new Error(`Supabase Storage 업로드 실패: ${error.message}`);
	}

	const {
		data: { publicUrl },
	} = supabase.storage.from("uploads").getPublicUrl(fileName);

	return publicUrl;
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
		/**
		 * 페이지 집필 완료 콜백. resume 시 page를 즉시 DB에 저장하려면 활용.
		 * page 인자: 방금 생성된 페이지 ({pageOrder, caption}).
		 */
		onNovelPageDone?: (
			doneCount: number,
			totalCount: number,
			usage: { inputTokens: number; outputTokens: number },
			page?: { pageOrder: number; caption: string },
		) => Promise<void> | void;
		/** 이미 생성된 아웃라인이 있을 경우 outline API 호출을 건너뜀 (resume 전용). */
		existingOutline?: NovelOutline;
		/** 이미 저장된 페이지 수. 이 index부터 집필을 재개함 (0-based, resume 전용). */
		resumeFromPageIndex?: number;
		/** 재개 시 이전 페이지 문맥으로 쓸 기존 저장 페이지 목록 (resume 전용). */
		existingPages?: Array<{ pageOrder: number; caption: string }>;
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
		// ── 아웃라인 (outline + blueprint) ──────────────────────────────────────
		let tagline: string;
		let synopsis: string;
		let characterProfiles: string[];
		let chapters: Array<{ title: string; summary: string }>;
		let pageBlueprints: Array<{
			pageOrder: number;
			beat: string;
			emotion: string;
			keyDetail: string;
		}>;

		if (options?.existingOutline) {
			// resume 경로: API 호출 생략
			const o = options.existingOutline;
			tagline = o.tagline;
			synopsis = o.synopsis;
			characterProfiles = o.characterProfiles;
			chapters = o.chapters;
			pageBlueprints = Array.from({ length: input.pageCount }).map(
				(_, idx) => {
					const bp = o.pageBlueprints[idx];
					return (
						bp ?? {
							pageOrder: idx + 1,
							beat: `${idx + 1}페이지 사건`,
							emotion: "",
							keyDetail: "",
						}
					);
				},
			);
		} else {
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

			tagline = String(outline.tagline || input.title);
			synopsis = String(outline.synopsis || input.description);
			characterProfiles = Array.isArray(outline.characterProfiles)
				? outline.characterProfiles
						.map((v) => String(v || ""))
						.filter(Boolean)
				: [];
			chapters = Array.isArray(outline.chapters)
				? outline.chapters.map((c, i) => {
						const item = c as {
							title?: unknown;
							summary?: unknown;
						};
						return {
							title: String(item.title || `${i + 1}장`),
							summary: String(item.summary || ""),
						};
					})
				: [];
			const rawBlueprints = Array.isArray(outline.pageBlueprints)
				? outline.pageBlueprints
				: [];
			pageBlueprints = Array.from({ length: input.pageCount }).map(
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
						beat: String(
							candidate?.beat || `${idx + 1}페이지 사건`,
						),
						emotion: String(candidate?.emotion || ""),
						keyDetail: String(candidate?.keyDetail || ""),
					};
				},
			);
		}

		const resumeFromPageIndex = Math.max(
			0,
			Math.min(input.pageCount - 1, options?.resumeFromPageIndex ?? 0),
		);

		// 기존 저장된 페이지로 pages 배열을 seed (이전 페이지 문맥 제공)
		const pages: Array<{ pageOrder: number; caption: string }> =
			options?.existingPages
				? [...options.existingPages].sort(
						(a, b) => a.pageOrder - b.pageOrder,
					)
				: [];

		if (!options?.existingOutline) {
			// 최초 생성: 아웃라인 완료 시점을 progress 0 으로 알림
			await options?.onNovelPageDone?.(0, input.pageCount, {
				inputTokens: usageCounter.inputTokens,
				outputTokens: usageCounter.outputTokens,
			});
		}

		for (let idx = resumeFromPageIndex; idx < input.pageCount; idx++) {
			const pageOrder = idx + 1;
			const blueprint = pageBlueprints[idx];
			// pages 배열에서 직전 2페이지 텍스트 탐색 (seed된 기존 페이지 포함)
			const prevPage = pages.find((p) => p.pageOrder === pageOrder - 1);
			const prevPrevPage = pages.find(
				(p) => p.pageOrder === pageOrder - 2,
			);
			const prevPageText = prevPage?.caption || "";
			const prevPrevPageText = prevPrevPage?.caption || "";

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

			const newPage = { pageOrder, caption: pageCaption };
			pages.push(newPage);
			const writtenCount =
				pages.length - (options?.existingPages?.length ?? 0);
			await options?.onNovelPageDone?.(
				(options?.resumeFromPageIndex ?? 0) + writtenCount,
				input.pageCount,
				{
					inputTokens: usageCounter.inputTokens,
					outputTokens: usageCounter.outputTokens,
				},
				newPage,
			);
		}

		const existingCount = options?.existingPages?.length ?? 0;
		return {
			tagline,
			synopsis,
			characterProfiles,
			chapters,
			// resume 경로면 새로 생성한 페이지만 반환 (route에서 DB pages와 병합)
			pages: existingCount > 0 ? pages.slice(existingCount) : pages,
			newPagesOnly: existingCount > 0,
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
					"각 페이지의 dialogues는 반드시 한국어(한글)로만 작성하라. 영어 사용 절대 금지.",
					"dialogues는 1~2개이며, 각 대사는 8자 이내의 짧고 임팩트 있는 한글 문장으로 작성하라. (예: '잠깐!', '여기야!', '믿어줘.')",
					"dialogues는 말풍선에 렌더링될 실제 텍스트이므로 반드시 짧고 명확한 한글이어야 한다.",
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

function clampDialogue(text: string): string {
	// 말풍선 렌더링 최적화: 10자 초과 시 자연스러운 지점에서 자름
	const t = String(text || "").trim();
	if (t.length <= 10) return t;
	// 구두점 앞에서 자르기 시도
	const cutPoints = ["!", "?", ".", "~", "…", ","];
	for (const c of cutPoints) {
		const idx = t.indexOf(c);
		if (idx > 0 && idx <= 10) return t.slice(0, idx + 1);
	}
	return t.slice(0, 8) + "…";
}

function ensurePageDialogues(page: {
	pageOrder: number;
	caption: string;
	dialogues?: string[];
}): string[] {
	if (Array.isArray(page.dialogues) && page.dialogues.length > 0) {
		const lines = page.dialogues
			.map((line) => clampDialogue(String(line || "").trim()))
			.filter(Boolean)
			.slice(0, 2);
		if (lines.length > 0) return lines;
	}

	const caption = String(page.caption || "").trim();
	if (!caption) {
		return ["잠깐!", "해낼 거야!"];
	}

	// caption에서 자연어 첫 문장 추출
	const firstSentence = (caption.match(/[^!?.~\n,，。！？]{2,8}[!?~！？]?/) ||
		[])[0];
	return [firstSentence ? clampDialogue(firstSentence) : "좋아!"];
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
		// dall-e-2는 한글 텍스트 렌더링 불가 → 빈 말풍선만 요청
		"Include speech bubble shapes with '...' placeholder text only. Do NOT attempt to render Korean text.",
	].join(" ");
}

/**
 * 모델별 말풍선 프롬프트 생성
 * - gpt-image-1/hd: 한글 텍스트 렌더링 가능 → 강력한 한글 강제
 * - dall-e-3/hd: 제한적 렌더링 → 짧은 텍스트 + 한글 강제
 * - dall-e-2: 한글 렌더링 불가 → 빈 말풍선(buildLowCostModelPromptBooster에서 처리)
 */
function buildSpeechBubblePrompt(
	model: ImageModel,
	dialogues: string[],
): string[] {
	if (model === "gpt-image-1" || model === "gpt-image-1-hd") {
		// 최고 품질 모델: 한글 텍스트 렌더링 강제
		return [
			`CRITICAL: Include exactly ${dialogues.length} speech bubble(s). ALL text inside bubbles MUST be Korean Hangul (한글) characters only.`,
			`Speech bubble Korean text: ${dialogues.map((d, i) => `bubble${i + 1}=「${d}」`).join(", ")}.`,
			"Each speech bubble must display legible Korean Hangul glyphs. No English, no romanization, no garbled text.",
		];
	}
	if (model === "dall-e-3" || model === "dall-e-3-hd") {
		// 중간 모델: 짧은 텍스트로 한글 렌더링 시도
		return [
			`Include ${dialogues.length} speech bubble(s) with short Korean Hangul text only.`,
			`Bubble text (must be Korean Hangul 한글, NOT English): ${dialogues.join(" / ")}.`,
			"Text in bubbles must show actual Korean characters (한글). Keep text very short for readability.",
		];
	}
	// dall-e-2: buildLowCostModelPromptBooster에서 처리
	return [];
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
	characterImages?: CharacterImageRef[];
	imageModel?: ImageModel;
	maxParallel?: number;
	retryCount?: number;
	checkpointKey?: string;
	/** DB에 이미 저장된 페이지 이미지 URL (resume 시 /tmp 유실 대비 주입) */
	savedPageImageUrls?: Record<number, string>;
	/** DB에 이미 저장된 커버 이미지 URL (resume 시 /tmp 유실 대비 주입) */
	savedCoverImageUrl?: string;
	onPageDone?: (
		doneCount: number,
		totalCount: number,
		page?: { pageOrder: number; imageUrl: string },
	) => Promise<void> | void;
}): Promise<{ coverImageUrl: string; pageImageUrls: string[] }> {
	const client = getOpenAIClient();
	const imageModel = params.imageModel || DEFAULT_IMAGE_MODEL;
	// 분당 5장 rate limit 모델: gpt-image-1, gpt-image-1-hd, dall-e-3, dall-e-3-hd → 순차 처리 + 요청 전 13s 간격
	// dall-e-2: 분당 50장으로 병렬 처리 안전
	const isRateLimitedModel =
		imageModel === "gpt-image-1" ||
		imageModel === "gpt-image-1-hd" ||
		imageModel === "dall-e-3" ||
		imageModel === "dall-e-3-hd";
	const maxParallel = isRateLimitedModel
		? 1
		: Math.max(1, Math.min(8, params.maxParallel || 4));
	const retryCount = Math.max(0, Math.min(5, params.retryCount ?? 3));
	const charImages = (params.characterImages || []).filter(
		(r) => r.imageUrl && r.name,
	);
	// gpt-image-1 / gpt-image-1-hd 는 Responses API로 참조 이미지 지원
	const useResponsesApi =
		(imageModel === "gpt-image-1" || imageModel === "gpt-image-1-hd") &&
		charImages.length > 0;
	const imageQuality =
		imageModel === "dall-e-3-hd"
			? "hd"
			: imageModel === "gpt-image-1-hd"
				? "high"
				: imageModel === "dall-e-3"
					? "standard"
					: imageModel === "gpt-image-1"
						? "medium"
						: undefined;
	// Responses API 사용 시 모델은 gpt-4o (visual reasoning)
	const responsesModel = "gpt-4o";
	// images.generate 에서 사용할 실제 모델 식별자
	const generateApiModel =
		imageModel === "dall-e-3-hd"
			? "dall-e-3"
			: imageModel === "gpt-image-1-hd"
				? "gpt-image-1"
				: imageModel;

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

	// 참조 이미지로부터 캐릭터 앵커 추가
	const refCharacterNote =
		charImages.length > 0
			? `Character reference names: ${charImages.map((r) => r.name).join(", ")}. Strictly maintain each character's visual appearance from the provided reference images.`
			: "";

	const coverPrompt = [
		stylePrefix + " cover art",
		`Title: ${params.title}`,
		`Synopsis: ${params.synopsis}`,
		characterAnchor,
		refCharacterNote,
		"No text, no letters on image. Vivid composition, high quality, full scene.",
	]
		.filter(Boolean)
		.join(". ");

	const checkpoint = (await readComicImageCheckpoint(
		params.checkpointKey,
	)) || {
		version: 1 as const,
		pageImageUrlsByOrder: {},
		updatedAt: new Date().toISOString(),
	};

	// DB에서 넘어온 저장 URL을 체크포인트에 병합 (Vercel /tmp 유실 시 복원)
	if (params.savedCoverImageUrl && !checkpoint.coverImageUrl) {
		checkpoint.coverImageUrl = params.savedCoverImageUrl;
	}
	if (params.savedPageImageUrls) {
		for (const [orderStr, url] of Object.entries(
			params.savedPageImageUrls,
		)) {
			const order = Number(orderStr);
			if (url && !checkpoint.pageImageUrlsByOrder[order]) {
				checkpoint.pageImageUrlsByOrder[order] = url;
			}
		}
	}

	/**
	 * Responses API를 통해 참조 이미지와 함께 이미지 생성
	 */
	async function generateWithResponsesApi(
		prompt: string,
		prefix: string,
	): Promise<string> {
		const contentItems: Array<Record<string, unknown>> = charImages.map(
			(ref) => ({
				type: "input_image",
				image_url: ref.imageUrl,
			}),
		);
		contentItems.push({ type: "input_text", text: prompt });

		const response = await (client as any).responses.create({
			model: responsesModel,
			input: [{ role: "user", content: contentItems }],
			tools: [
				{
					type: "image_generation",
					quality:
						imageModel === "gpt-image-1-hd" ? "high" : "medium",
					size: "1024x1024",
					output_format: "png",
				},
			],
		});

		const imageCall = (
			response.output as Array<Record<string, unknown>>
		)?.find((o) => o.type === "image_generation_call");
		if (!imageCall?.result) {
			throw new Error("Responses API에서 이미지 결과를 받지 못했습니다.");
		}

		return persistGeneratedImage({
			image: { b64_json: imageCall.result as string },
			prefix,
		});
	}

	/**
	 * 일반 images.generate API 사용
	 */
	async function generateWithImagesApi(
		prompt: string,
		prefix: string,
	): Promise<string> {
		const genParams: Record<string, unknown> = {
			model: generateApiModel,
			prompt,
			size: "1024x1024",
		};
		if (imageQuality) {
			genParams.quality = imageQuality;
		}
		const result = await client.images.generate(
			genParams as unknown as Parameters<
				typeof client.images.generate
			>[0],
		);
		const img = result.data?.[0];
		if (!img) throw new Error("이미지 생성 응답이 비어 있습니다.");
		return persistGeneratedImage({ image: img, prefix });
	}

	async function generateImage(
		prompt: string,
		prefix: string,
	): Promise<string> {
		return useResponsesApi
			? generateWithResponsesApi(prompt, prefix)
			: generateWithImagesApi(prompt, prefix);
	}

	let coverImageUrl = checkpoint.coverImageUrl;
	if (!coverImageUrl) {
		coverImageUrl = await generateImage(coverPrompt, "comic-cover");
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
			imageModel === "dall-e-2"
				? buildLowCostModelPromptBooster({
						pageOrder: page.pageOrder,
						totalCount,
						dialogues,
					})
				: "";
		const speechBubbleParts = buildSpeechBubblePrompt(
			imageModel,
			dialogues,
		);
		const pagePrompt = [
			stylePrefix,
			`Use the same character appearance as the already generated cover image (${coverImageUrl}).`,
			coverVisualLock,
			characterAnchor,
			refCharacterNote,
			shotDirection ? `Shot direction: ${shotDirection}` : "",
			page.imagePrompt || page.caption,
			...speechBubbleParts,
			"Consistent character appearance with other panels. Dynamic camera angle. Distinct composition from adjacent scenes.",
			"No watermark.",
			lowCostBooster,
		]
			.filter(Boolean)
			.join(". ");

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				// rate-limited 모델: 요청 전 간격 확보 (첫 시도 포함)
				if (isRateLimitedModel && attempt === 0) {
					await new Promise((r) => setTimeout(r, 13_000));
				}
				const localUrl = await generateImage(
					pagePrompt,
					`comic-page-${page.pageOrder}`,
				);
				pageImageUrls[idx] = localUrl;
				checkpoint.pageImageUrlsByOrder[page.pageOrder] = localUrl;
				checkpoint.updatedAt = new Date().toISOString();
				await writeComicImageCheckpoint({
					checkpointKey: params.checkpointKey,
					data: checkpoint,
				});

				doneCount += 1;
				if (params.onPageDone) {
					await params.onPageDone(doneCount, totalCount, {
						pageOrder: page.pageOrder,
						imageUrl: localUrl,
					});
				}
				return;
			} catch (error) {
				if (isOpenAIQuotaExceededError(error)) {
					throw error;
				}
				// 429 rate limit: 재시도 전 대기 (20s * (attempt+1))
				const errStatus = (error as { status?: number }).status;
				const isRateLimit =
					errStatus === 429 ||
					(error instanceof Error &&
						(error.message.includes("429") ||
							error.message
								.toLowerCase()
								.includes("rate limit")));
				if (attempt < retryCount) {
					const waitMs = isRateLimit ? 20_000 * (attempt + 1) : 2_000;
					await new Promise((r) => setTimeout(r, waitMs));
					continue;
				}
				throw new Error(
					`${page.pageOrder}페이지 이미지 생성 실패 (재시도 ${retryCount}회 초과): ${
						error instanceof Error
							? error.message
							: "알 수 없는 오류"
					}`,
				);
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

	const generateApiModel =
		imageModel === "dall-e-3-hd"
			? "dall-e-3"
			: imageModel === "gpt-image-1-hd"
				? "gpt-image-1"
				: imageModel;
	const imageQuality =
		imageModel === "dall-e-3-hd"
			? "hd"
			: imageModel === "gpt-image-1-hd"
				? "high"
				: imageModel === "dall-e-3"
					? "standard"
					: imageModel === "gpt-image-1"
						? "medium"
						: undefined;

	const genParams: Record<string, unknown> = {
		model: generateApiModel,
		prompt: coverPrompt,
		size: "1024x1024",
	};
	if (imageQuality) {
		genParams.quality = imageQuality;
	}
	const response = await client.images.generate(
		genParams as unknown as Parameters<typeof client.images.generate>[0],
	);

	const image = response.data?.[0];
	if (!image) {
		throw new Error("소설 표지 이미지 생성에 실패했습니다.");
	}

	return persistGeneratedImage({
		image,
		prefix: "story-cover",
	});
}
