import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
	MissingOpenAIKeyError,
	generateBookPlan,
	generateComicImages,
} from "@/lib/ai-generator";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	estimateOpenAICost,
	isImageModel,
	isStoryModel,
} from "@/lib/ai-pricing";

// GET /api/projects — 프로젝트 목록
export async function GET() {
	const projects = await prisma.project.findMany({
		include: { pages: { orderBy: { pageOrder: "asc" } } },
		orderBy: { updatedAt: "desc" },
	});
	return NextResponse.json({ success: true, data: projects });
}

// POST /api/projects — 새 프로젝트 생성 (+ Sweetbook book 생성 시도)
export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const {
			title,
			coupleNameA,
			coupleNameB,
			anniversaryDate,
			projectType = "PHOTOBOOK",
			genre,
			description,
			characters,
			pageCount,
			comicStyle,
			storyModel,
			imageModel,
		} = body;

		if (!title) {
			return NextResponse.json(
				{ success: false, error: "필수 항목이 누락되었습니다." },
				{ status: 400 },
			);
		}

		if (projectType === "PHOTOBOOK") {
			if (!coupleNameA || !coupleNameB || !anniversaryDate) {
				return NextResponse.json(
					{ success: false, error: "필수 항목이 누락되었습니다." },
					{ status: 400 },
				);
			}

			const project = await prisma.project.create({
				data: {
					title,
					coupleNameA,
					coupleNameB,
					anniversaryDate: new Date(anniversaryDate),
					projectType: "PHOTOBOOK",
				},
				include: { pages: true },
			});

			let bookUid: string | null = null;
			try {
				const { getSweetbookClient } =
					await import("@/lib/sweetbook-api");
				const client = getSweetbookClient();
				const book = (await client.books.create({
					bookSpecUid: "SQUAREBOOK_HC",
					title,
					creationType: "NORMAL",
				})) as { bookUid?: string };
				bookUid = book.bookUid || null;

				if (bookUid) {
					await prisma.project.update({
						where: { id: project.id },
						data: { bookUid },
					});
				}
			} catch {
				// API 키 없거나 오류 → bookUid는 나중에 publish 시 생성
			}

			return NextResponse.json(
				{ success: true, data: { ...project, bookUid } },
				{ status: 201 },
			);
		}

		if (!genre || !description || !characters || !pageCount) {
			return NextResponse.json(
				{
					success: false,
					error: "AI 생성 필수 항목이 누락되었습니다.",
				},
				{ status: 400 },
			);
		}

		const normalizedType = projectType === "NOVEL" ? "NOVEL" : "COMIC";
		const normalizedCount = Math.max(
			4,
			Math.min(120, Number(pageCount) || 12),
		);
		const selectedStoryModel = isStoryModel(storyModel)
			? storyModel
			: DEFAULT_STORY_MODEL;
		const selectedImageModel = isImageModel(imageModel)
			? imageModel
			: DEFAULT_IMAGE_MODEL;
		const characterList = String(characters)
			.split(",")
			.map((v: string) => v.trim())
			.filter(Boolean);

		const plan = await generateBookPlan(
			{
				title: String(title),
				characters: String(characters),
				genre: String(genre),
				description: String(description),
				pageCount: normalizedCount,
				bookKind: normalizedType,
				comicStyle: comicStyle || "MANGA",
			},
			{
				storyModel: selectedStoryModel,
			},
		);

		const costEstimate = estimateOpenAICost({
			kind: normalizedType,
			pageCount: normalizedCount,
			storyModel: selectedStoryModel,
			imageModel: selectedImageModel,
		});

		let coverImageUrl = `https://picsum.photos/seed/${encodeURIComponent(String(title))}-cover/900/700`;
		let pageImageUrls = plan.pages.map(
			(page) =>
				`https://picsum.photos/seed/${encodeURIComponent(String(title))}-${page.pageOrder}/900/700`,
		);

		if (normalizedType === "COMIC") {
			const generatedImages = await generateComicImages({
				title: String(title),
				synopsis: plan.synopsis,
				comicStyle: comicStyle || "MANGA",
				pages: plan.pages,
				imageModel: selectedImageModel,
			});
			coverImageUrl = generatedImages.coverImageUrl;
			pageImageUrls = generatedImages.pageImageUrls;
		}

		const project = await prisma.project.create({
			data: {
				title: String(title),
				coupleNameA: characterList[0] || "주인공A",
				coupleNameB: characterList[1] || "주인공B",
				anniversaryDate: new Date(),
				projectType: normalizedType,
				genre: String(genre),
				synopsis: plan.synopsis,
				comicStyle:
					normalizedType === "COMIC" ? comicStyle || "MANGA" : null,
				coverCaption: plan.tagline,
				coverImageUrl,
				status: "PUBLISHED",
				pages: {
					create: plan.pages.map((page, index) => ({
						pageOrder: page.pageOrder,
						caption: page.caption,
						imageUrl:
							pageImageUrls[index] ||
							`https://picsum.photos/seed/${encodeURIComponent(String(title))}-${page.pageOrder}/900/700`,
					})),
				},
			},
			include: { pages: { orderBy: { pageOrder: "asc" } } },
		});

		return NextResponse.json(
			{
				success: true,
				data: { ...project, aiCostEstimate: costEstimate },
			},
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof MissingOpenAIKeyError) {
			return NextResponse.json(
				{ success: false, error: err.message },
				{ status: 400 },
			);
		}
		console.error("[POST /api/projects]", err);
		return NextResponse.json(
			{ success: false, error: "프로젝트 생성 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
