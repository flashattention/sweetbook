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

	const response = await client.chat.completions.create({
		model,
		temperature: 0.7,
		response_format: { type: "json_object" },
		messages: [{ role: "user", content: prompt }],
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
	imageModel?: ImageModel;
}): Promise<{ coverImageUrl: string; pageImageUrls: string[] }> {
	const client = getOpenAIClient();
	const imageModel = params.imageModel || DEFAULT_IMAGE_MODEL;

	const coverPrompt = [
		`Korean ${params.comicStyle.toLowerCase()} comic cover illustration`,
		`Title: ${params.title}`,
		`Synopsis: ${params.synopsis}`,
		"No text letters on image, vivid composition, high quality",
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
	for (const page of params.pages) {
		const pagePrompt = [
			`${params.comicStyle.toLowerCase()} comic panel illustration`,
			page.imagePrompt || page.caption,
			"No watermark, no text overlay",
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
	}

	return { coverImageUrl, pageImageUrls };
}
