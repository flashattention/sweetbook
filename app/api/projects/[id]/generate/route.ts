import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
	ComicStyle,
	MissingOpenAIKeyError,
	generateBookPlan,
	generateComicImages,
	generateStoryCoverImage,
} from "@/lib/ai-generator";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	isImageModel,
	isStoryModel,
	calcStoryActualCostUsd,
	IMAGE_PRICING_PER_IMAGE_USD,
	type ImageModel,
} from "@/lib/ai-pricing";

function toComicStyle(value: string | null | undefined): ComicStyle {
	return value === "CARTOON" ||
		value === "AMERICAN" ||
		value === "PICTURE_BOOK"
		? value
		: "MANGA";
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

// POST /api/projects/[id]/generate
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const body = await req.json().catch(() => ({}));
		const storyModel = isStoryModel(body?.storyModel)
			? body.storyModel
			: DEFAULT_STORY_MODEL;
		const imageModel: ImageModel = isImageModel(body?.imageModel)
			? body.imageModel
			: DEFAULT_IMAGE_MODEL;

		const project = await prisma.project.findFirst({
			where: { id: params.id, userId: user.id },
			include: { pages: { orderBy: { pageOrder: "asc" } } },
		});
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}
		if (project.projectType === "PHOTOBOOK") {
			return NextResponse.json(
				{ success: false, error: "포토북 프로젝트는 대상이 아닙니다." },
				{ status: 400 },
			);
		}

		if (project.status === "PUBLISHED" && project.pages.length > 0) {
			return NextResponse.json({ success: true, data: project });
		}

		await prisma.project.update({
			where: { id: project.id },
			data: {
				generationStage: "PLANNING",
				generationProgress: 10,
				generationError: null,
			} as any,
		});

		const normalizedType =
			project.projectType === "NOVEL" ? "NOVEL" : "COMIC";
		const pageCount = Math.max(
			24,
			Math.min(
				120,
				(project as { requestedPageCount?: number | null })
					.requestedPageCount || 24,
			),
		);
		const comicStyle = toComicStyle(project.comicStyle);
		const plan = await generateBookPlan(
			{
				title: project.title,
				characters: project.storyCharacters || "주인공",
				genre: project.genre || "일반",
				description: project.synopsis || "",
				pageCount,
				bookKind: normalizedType,
				comicStyle,
			},
			{ storyModel },
		);

		// 실제 스토리 생성 비용 계산 후 저장
		let runningCostUsd = calcStoryActualCostUsd(
			plan.actualUsage,
			storyModel,
		);
		await prisma.project.update({
			where: { id: project.id },
			data: { generationCostUsd: runningCostUsd } as any,
		});

		let coverImageUrl = `https://picsum.photos/seed/${encodeURIComponent(project.title)}-cover/900/700`;
		let pageImageUrls = plan.pages.map(
			(page) =>
				`https://picsum.photos/seed/${encodeURIComponent(project.title)}-${page.pageOrder}/900/700`,
		);

		if (normalizedType === "COMIC") {
			const totalPages = plan.pages.length;
			await prisma.project.update({
				where: { id: project.id },
				data: {
					generationStage: `IMAGING:0:${totalPages}`,
					generationProgress: 35,
				} as any,
			});
			let lastDoneCount = 0;

			const generatedImages = await generateComicImages({
				title: project.title,
				synopsis: plan.synopsis,
				comicStyle,
				pages: plan.pages,
				characterProfiles: plan.characterProfiles,
				imageModel,
				maxParallel: imageModel === "dall-e-2" ? 6 : 4,
				retryCount: 2,
				checkpointKey: project.id,
				onPageDone: async (done, total) => {
					const progress = 35 + Math.floor((done / total) * 50);
					const delta = Math.max(0, done - lastDoneCount);
					lastDoneCount = done;
					if (delta > 0) {
						runningCostUsd +=
							delta * IMAGE_PRICING_PER_IMAGE_USD[imageModel];
					}
					await prisma.project.update({
						where: { id: project.id },
						data: {
							generationStage: `IMAGING:${done}:${total}`,
							generationProgress: progress,
							generationCostUsd: runningCostUsd,
						} as any,
					});
				},
			});
			// 표지 이미지 비용도 누적 (+1)
			runningCostUsd += IMAGE_PRICING_PER_IMAGE_USD[imageModel];
			coverImageUrl = generatedImages.coverImageUrl;
			pageImageUrls = generatedImages.pageImageUrls;
		} else {
			const generatedCoverImageUrl = await generateStoryCoverImage({
				title: project.title,
				synopsis: plan.synopsis,
				genre: project.genre || undefined,
				imageModel,
			});
			coverImageUrl = generatedCoverImageUrl;
		}

		await prisma.project.update({
			where: { id: project.id },
			data: {
				synopsis: plan.synopsis,
				coverCaption: plan.tagline,
				coverImageUrl,
				comicStyle: normalizedType === "COMIC" ? comicStyle : null,
				pages: {
					deleteMany: {},
					create: plan.pages.map((page, index) => ({
						pageOrder: page.pageOrder,
						caption: page.caption,
						imageUrl:
							pageImageUrls[index] ||
							`https://picsum.photos/seed/${encodeURIComponent(project.title)}-${page.pageOrder}/900/700`,
					})),
				},
				status: "PUBLISHED",
				generationStage: "SAVING",
				generationProgress: 92,
			} as any,
		});

		await prisma.project.update({
			where: { id: project.id },
			data: {
				generationStage: "COMPLETED",
				generationProgress: 100,
				generationError: null,
			} as any,
		});

		const updated = await prisma.project.findUnique({
			where: { id: project.id },
			include: { pages: { orderBy: { pageOrder: "asc" } } },
		});

		return NextResponse.json({ success: true, data: updated });
	} catch (err) {
		if (err instanceof MissingOpenAIKeyError) {
			return NextResponse.json(
				{ success: false, error: err.message },
				{ status: 400 },
			);
		}

		const isQuotaExceeded = isOpenAIQuotaExceededError(err);
		const message = isQuotaExceeded
			? "OpenAI API 크레딧이 부족합니다. 충전 후 홈에서 다시 시도해 주세요."
			: err instanceof Error
				? err.message
				: "스토리 생성 실패";
		console.error("[POST /api/projects/[id]/generate]", err);
		await prisma.project
			.update({
				where: { id: params.id },
				data: {
					generationStage: "FAILED",
					generationError: message,
				} as any,
			})
			.catch(() => {});
		return NextResponse.json(
			{
				success: false,
				error: message,
				errorCode: isQuotaExceeded
					? "OPENAI_QUOTA_EXCEEDED"
					: undefined,
			},
			{ status: isQuotaExceeded ? 429 : 500 },
		);
	}
}
