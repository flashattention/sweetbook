import { NextRequest, NextResponse } from "next/server";
import { MissingOpenAIKeyError, generateBookPlan } from "@/lib/ai-generator";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	estimateOpenAICost,
	isImageModel,
	isStoryModel,
} from "@/lib/ai-pricing";

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const {
			title,
			characters,
			genre,
			description,
			pageCount,
			bookKind,
			comicStyle,
			storyModel,
			imageModel,
		} = body;

		if (
			!title ||
			!characters ||
			!genre ||
			!description ||
			!pageCount ||
			!bookKind
		) {
			return NextResponse.json(
				{ success: false, error: "필수 입력값이 누락되었습니다." },
				{ status: 400 },
			);
		}

		const normalizedCount = Math.max(
			4,
			Math.min(120, Number(pageCount) || 12),
		);
		const normalizedKind = bookKind === "NOVEL" ? "NOVEL" : "COMIC";
		const selectedStoryModel = isStoryModel(storyModel)
			? storyModel
			: DEFAULT_STORY_MODEL;
		const selectedImageModel = isImageModel(imageModel)
			? imageModel
			: DEFAULT_IMAGE_MODEL;

		const result = await generateBookPlan(
			{
				title: String(title),
				characters: String(characters),
				genre: String(genre),
				description: String(description),
				pageCount: normalizedCount,
				bookKind: normalizedKind,
				comicStyle,
			},
			{
				storyModel: selectedStoryModel,
			},
		);

		const costEstimate = estimateOpenAICost({
			kind: normalizedKind,
			pageCount: normalizedCount,
			storyModel: selectedStoryModel,
			imageModel: selectedImageModel,
		});

		return NextResponse.json({
			success: true,
			data: { ...result, aiCostEstimate: costEstimate },
		});
	} catch (err) {
		if (err instanceof MissingOpenAIKeyError) {
			return NextResponse.json(
				{ success: false, error: err.message },
				{ status: 400 },
			);
		}
		console.error("[POST /api/ai/generate-book]", err);
		return NextResponse.json(
			{ success: false, error: "AI 생성 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
