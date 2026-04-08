import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MissingOpenAIKeyError, ComicStyle } from "@/lib/ai-generator";
import { DEFAULT_STORY_MODEL, isStoryModel } from "@/lib/ai-pricing";
import {
	DEFAULT_PHOTOBOOK_SPEC_UID,
	getSupportedBookSpec,
} from "@/lib/book-specs";

interface CreateProjectBody {
	title?: unknown;
	projectType?: unknown;
	genre?: unknown;
	description?: unknown;
	characters?: unknown;
	pageCount?: unknown;
	comicStyle?: unknown;
	storyModel?: unknown;
	imageModel?: unknown;
	bookSpecUid?: unknown;
}

async function createPhotobookProject(params: {
	title: string;
	bookSpecUid?: string;
}) {
	const selectedBookSpecUid = getSupportedBookSpec(
		params.bookSpecUid,
	).bookSpecUid;

	const project = await prisma.project.create({
		data: {
			title: params.title,
			projectType: "PHOTOBOOK",
			bookSpecUid: selectedBookSpecUid,
		},
		include: { pages: true },
	});

	let bookUid: string | null = null;
	try {
		const { getSweetbookClient } = await import("@/lib/sweetbook-api");
		const client = getSweetbookClient();
		const book = (await client.books.create({
			bookSpecUid: selectedBookSpecUid || DEFAULT_PHOTOBOOK_SPEC_UID,
			title: params.title,
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
		// API 키 없거나 오류면 publish 시점에 bookUid를 생성한다.
	}

	return NextResponse.json(
		{ success: true, data: { ...project, bookUid } },
		{ status: 201 },
	);
}

async function createStoryProject(params: {
	title: string;
	projectType: "COMIC" | "NOVEL";
	genre: string;
	description: string;
	characters: string;
	pageCount: number;
	comicStyle?: "MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK";
	storyModel?: unknown;
	bookSpecUid?: string;
}) {
	const selectedBookSpecUid = getSupportedBookSpec(
		params.bookSpecUid,
	).bookSpecUid;
	const selectedStoryModel = isStoryModel(params.storyModel)
		? params.storyModel
		: DEFAULT_STORY_MODEL;
	const normalizedCount = Math.max(
		24,
		Math.min(120, Number(params.pageCount) || 24),
	);

	const project = await prisma.project.create({
		data: {
			title: params.title,
			storyCharacters: params.characters,
			requestedPageCount: normalizedCount,
			generationStage: "QUEUED",
			generationProgress: 0,
			generationError: null,
			projectType: params.projectType,
			bookSpecUid: selectedBookSpecUid,
			genre: params.genre,
			synopsis: params.description,
			comicStyle:
				params.projectType === "COMIC"
					? params.comicStyle || "MANGA"
					: null,
			coverCaption: "",
			coverImageUrl: null,
			status: "DRAFT",
		} as any,
		include: { pages: { orderBy: { pageOrder: "asc" } } },
	});

	return NextResponse.json(
		{
			success: true,
			data: {
				...project,
				generationMeta: {
					storyModel: selectedStoryModel,
					comicStyle:
						params.projectType === "COMIC"
							? ((params.comicStyle || "MANGA") as ComicStyle)
							: null,
				},
			},
		},
		{ status: 201 },
	);
}

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
		const body = (await req.json()) as CreateProjectBody;
		const {
			title,
			projectType = "PHOTOBOOK",
			genre,
			description,
			characters,
			pageCount,
			comicStyle,
			storyModel,
			imageModel,
			bookSpecUid,
		} = body;

		if (!title) {
			return NextResponse.json(
				{ success: false, error: "필수 항목이 누락되었습니다." },
				{ status: 400 },
			);
		}

		const normalizedTitle = String(title);
		const normalizedProjectType =
			projectType === "NOVEL" ? "NOVEL" : projectType;

		if (normalizedProjectType === "PHOTOBOOK") {
			return createPhotobookProject({
				title: normalizedTitle,
				bookSpecUid:
					typeof bookSpecUid === "string" ? bookSpecUid : undefined,
			});
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

		return createStoryProject({
			title: normalizedTitle,
			projectType: normalizedProjectType === "NOVEL" ? "NOVEL" : "COMIC",
			genre: String(genre),
			description: String(description),
			characters: String(characters),
			pageCount: Number(pageCount),
			comicStyle:
				comicStyle === "MANGA" ||
				comicStyle === "CARTOON" ||
				comicStyle === "AMERICAN" ||
				comicStyle === "PICTURE_BOOK"
					? comicStyle
					: undefined,
			storyModel,
			bookSpecUid:
				typeof bookSpecUid === "string" ? bookSpecUid : undefined,
		});
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
