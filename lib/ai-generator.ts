import OpenAI from "openai";
import { mkdir, writeFile } from "fs/promises";
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
	pages: Array<{ pageOrder: number; caption: string; imagePrompt?: string }>;
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

function getOpenAIClient() {
	if (!process.env.OPENAI_API_KEY) {
		throw new MissingOpenAIKeyError();
	}
	return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

export async function generateBookPlan(
	input: GenerateBookInput,
	options?: { storyModel?: StoryModel },
): Promise<GenerateBookOutput> {
	const client = getOpenAIClient();
	const model = options?.storyModel || DEFAULT_STORY_MODEL;

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
		"chapters는 [{title, summary}] 배열, pages는 [{pageOrder, caption, imagePrompt}] 배열로 구성하라.",
		"pages 길이는 반드시 요청한 페이지 수와 같아야 한다.",
	]
		.filter(Boolean)
		.join("\n");

	const characterConsistencyNote =
		input.bookKind === "COMIC"
			? "각 페이지의 imagePrompt에는 등장인물의 외형(헤어 색상, 의상, 체형 등)을 반드시 상세히 포함시켜라. 모든 페이지에서 동일 캐릭터는 외형 묘사가 일치해야 한다."
			: "";
	const fullPrompt = characterConsistencyNote
		? `${prompt}\n${characterConsistencyNote}`
		: prompt;

	const response = await client.chat.completions.create({
		model,
		temperature: 0.7,
		response_format: { type: "json_object" },
		messages: [{ role: "user", content: fullPrompt }],
	});

	const raw = response.choices[0]?.message?.content;
	if (!raw) {
		throw new Error("OpenAI에서 생성 결과를 받지 못했습니다.");
	}

	try {
		const parsed = JSON.parse(raw) as Partial<GenerateBookOutput>;
		if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
			throw new Error("OpenAI 응답 JSON에 pages가 비어 있습니다.");
		}
		return {
			tagline: parsed.tagline || input.title,
			synopsis: parsed.synopsis || input.description,
			characterProfiles: Array.isArray(parsed.characterProfiles)
				? parsed.characterProfiles.map((v) => String(v))
				: [],
			chapters: Array.isArray(parsed.chapters)
				? parsed.chapters.map((c, i) => ({
						title: String(c.title || `${i + 1}장`),
						summary: String(c.summary || ""),
					}))
				: [],
			pages: parsed.pages.slice(0, input.pageCount).map((p, idx) => ({
				pageOrder: idx + 1,
				caption: String(p.caption || `${idx + 1}페이지`),
				imagePrompt:
					typeof p.imagePrompt === "string"
						? p.imagePrompt
						: undefined,
			})),
			actualUsage: {
				inputTokens: response.usage?.prompt_tokens ?? 0,
				outputTokens: response.usage?.completion_tokens ?? 0,
			},
		};
	} catch (error) {
		console.error("[generateBookPlan] parse error", error);
		throw new Error(
			"OpenAI 응답 파싱에 실패했습니다. 모델 출력 형식을 확인해주세요.",
		);
	}
}

export async function generateComicImages(params: {
	title: string;
	synopsis: string;
	comicStyle: ComicStyle;
	pages: Array<{ pageOrder: number; caption: string; imagePrompt?: string }>;
	characterProfiles?: string[];
	imageModel?: ImageModel;
	onPageDone?: (
		doneCount: number,
		totalCount: number,
	) => Promise<void> | void;
}): Promise<{ coverImageUrl: string; pageImageUrls: string[] }> {
	const client = getOpenAIClient();
	const imageModel = params.imageModel || DEFAULT_IMAGE_MODEL;

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

	const cover = await client.images.generate({
		model: imageModel,
		prompt: coverPrompt,
		size: "1024x1024",
	});

	const coverImage = cover.data?.[0];
	if (!coverImage) {
		throw new Error("OpenAI 표지 이미지 생성에 실패했습니다.");
	}

	const coverImageUrl = await persistGeneratedImage({
		image: coverImage,
		prefix: "comic-cover",
	});

	const pageImageUrls: string[] = [];
	const totalCount = params.pages.length;
	let doneCount = 0;
	for (const page of params.pages) {
		const pagePrompt = [
			stylePrefix,
			characterAnchor,
			page.imagePrompt || page.caption,
			"Consistent character appearance with other panels. No watermark, no text overlay.",
		].join(". ");

		const pageImageRes = await client.images.generate({
			model: imageModel,
			prompt: pagePrompt,
			size: "1024x1024",
		});

		const image = pageImageRes.data?.[0];
		if (!image) {
			throw new Error(
				`${page.pageOrder}페이지 이미지 생성에 실패했습니다.`,
			);
		}

		const localUrl = await persistGeneratedImage({
			image,
			prefix: `comic-page-${page.pageOrder}`,
		});
		pageImageUrls.push(localUrl);
		doneCount += 1;
		if (params.onPageDone) {
			await params.onPageDone(doneCount, totalCount);
		}
	}

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
