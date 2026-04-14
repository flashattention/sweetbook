import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import { MissingOpenAIKeyError, ComicStyle } from "@/lib/ai-generator";
import { DEFAULT_STORY_MODEL, isStoryModel } from "@/lib/ai-pricing";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";
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
	characterImages?: unknown;
	bookSpecUid?: unknown;
	coverTemplateUid?: unknown;
	contentTemplateUid?: unknown;
	coverTemplateOverrides?: unknown;
	contentTemplateOverrides?: unknown;
}

type SweetbookBookRecord = {
	bookUid?: string;
	title?: string;
	status?: string;
	bookStatus?: string;
	state?: string;
	bookSpecUid?: string;
	coverImageUrl?: string;
	coverUrl?: string;
	thumbnailUrl?: string;
	createdAt?: string;
	updatedAt?: string;
	[key: string]: unknown;
};

function pickSweetbookBookUid(item: SweetbookBookRecord): string | null {
	const uid = typeof item.bookUid === "string" ? item.bookUid.trim() : null;
	return uid || null;
}

function pickSweetbookBookTitle(item: SweetbookBookRecord): string {
	const rawCandidates = [item.title, item.bookUid];
	for (const value of rawCandidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return "Sweetbook 가져온 프로젝트";
}

function mapSweetbookBookStatus(
	item: SweetbookBookRecord,
): "DRAFT" | "PUBLISHED" {
	const raw = String(item.status || item.bookStatus || item.state || "")
		.toUpperCase()
		.trim();
	if (!raw) {
		return "PUBLISHED";
	}
	if (
		raw.includes("DRAFT") ||
		raw.includes("CREATED") ||
		raw.includes("EDIT") ||
		raw.includes("OPEN")
	) {
		return "DRAFT";
	}
	return "PUBLISHED";
}

function normalizeSweetbookBookList(
	payload: Record<string, unknown>,
): SweetbookBookRecord[] {
	const candidates = [
		payload.books,
		payload.items,
		payload.list,
		payload.results,
		payload.data,
	];

	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) {
			continue;
		}
		return candidate.filter(
			(item): item is SweetbookBookRecord =>
				Boolean(item) && typeof item === "object",
		);
	}

	return [];
}

async function syncProjectsFromSweetbookForUser(userId: string): Promise<void> {
	if (!isSweetbookConfigured()) {
		return;
	}

	try {
		const client = getSweetbookClient();
		const raw = (await client.books.list({
			limit: 200,
			offset: 0,
		})) as Record<string, unknown>;
		const remoteBooks = normalizeSweetbookBookList(raw);

		for (const remote of remoteBooks) {
			const bookUid = pickSweetbookBookUid(remote);
			if (!bookUid) {
				continue;
			}

			const existing = await prisma.project.findFirst({
				where: { bookUid, userId },
				select: { id: true },
			});
			if (existing) {
				continue;
			}

			const title = pickSweetbookBookTitle(remote);
			const status = mapSweetbookBookStatus(remote);
			const bookSpecUid =
				typeof remote.bookSpecUid === "string" &&
				remote.bookSpecUid.trim()
					? remote.bookSpecUid
					: DEFAULT_PHOTOBOOK_SPEC_UID;
			const coverImageUrl =
				typeof remote.coverImageUrl === "string" &&
				remote.coverImageUrl.trim()
					? remote.coverImageUrl
					: typeof remote.coverUrl === "string" &&
						  remote.coverUrl.trim()
						? remote.coverUrl
						: typeof remote.thumbnailUrl === "string" &&
							  remote.thumbnailUrl.trim()
							? remote.thumbnailUrl
							: null;

			await prisma.project.create({
				data: {
					userId,
					title,
					projectType: "PHOTOBOOK",
					bookSpecUid,
					bookUid,
					status,
					coverImageUrl,
				},
			});
		}
	} catch (err) {
		console.error("[GET /api/projects] sweetbook sync failed", err);
	}
}

function serializeTemplateOverrides(value: unknown) {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const parameters =
		raw.parameters && typeof raw.parameters === "object"
			? (raw.parameters as Record<string, unknown>)
			: undefined;
	const fileUrls =
		raw.fileUrls && typeof raw.fileUrls === "object"
			? (raw.fileUrls as Record<string, string | string[]>)
			: undefined;

	if (!parameters && !fileUrls) {
		return undefined;
	}

	return JSON.stringify({ parameters, fileUrls });
}

async function createPhotobookProject(params: {
	userId: string;
	title: string;
	bookSpecUid?: string;
	coverTemplateUid?: string;
	contentTemplateUid?: string;
	coverTemplateOverrides?: unknown;
	contentTemplateOverrides?: unknown;
}) {
	const selectedBookSpecUid = getSupportedBookSpec(
		params.bookSpecUid,
	).bookSpecUid;

	const project = await prisma.project.create({
		data: {
			userId: params.userId,
			title: params.title,
			projectType: "PHOTOBOOK",
			bookSpecUid: selectedBookSpecUid,
			coverTemplateUid: params.coverTemplateUid,
			contentTemplateUid: params.contentTemplateUid,
			coverTemplateOverrides: serializeTemplateOverrides(
				params.coverTemplateOverrides,
			),
			contentTemplateOverrides: serializeTemplateOverrides(
				params.contentTemplateOverrides,
			),
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
	userId: string;
	title: string;
	projectType: "COMIC" | "NOVEL";
	genre: string;
	description: string;
	characters: string;
	pageCount: number;
	comicStyle?: "MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK";
	storyModel?: unknown;
	characterImages?: Array<{ name: string; imageUrl: string }>;
	bookSpecUid?: string;
	coverTemplateUid?: string;
	contentTemplateUid?: string;
	coverTemplateOverrides?: unknown;
	contentTemplateOverrides?: unknown;
}) {
	const selectedBookSpecUid =
		params.projectType === "COMIC"
			? "SQUAREBOOK_HC"
			: getSupportedBookSpec(params.bookSpecUid).bookSpecUid;
	const selectedStoryModel = isStoryModel(params.storyModel)
		? params.storyModel
		: DEFAULT_STORY_MODEL;
	const normalizedCount = Math.max(
		24,
		Math.min(120, Number(params.pageCount) || 24),
	);

	const project = await prisma.project.create({
		data: {
			userId: params.userId,
			title: params.title,
			storyCharacters: params.characters,
			requestedPageCount: normalizedCount,
			generationStage: "QUEUED",
			generationProgress: 0,
			generationError: null,
			projectType: params.projectType,
			bookSpecUid: selectedBookSpecUid,
			coverTemplateUid: params.coverTemplateUid,
			contentTemplateUid: params.contentTemplateUid,
			coverTemplateOverrides: serializeTemplateOverrides(
				params.coverTemplateOverrides,
			),
			contentTemplateOverrides: serializeTemplateOverrides(
				params.contentTemplateOverrides,
			),
			genre: params.genre,
			synopsis: params.description,
			comicStyle:
				params.projectType === "COMIC"
					? params.comicStyle || "MANGA"
					: null,
			characterImagesJson:
				params.characterImages && params.characterImages.length > 0
					? JSON.stringify(params.characterImages)
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
export async function GET(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	await syncProjectsFromSweetbookForUser(user.id);

	const projects = await prisma.project.findMany({
		where: { userId: user.id },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
		orderBy: { updatedAt: "desc" },
	});
	return NextResponse.json({ success: true, data: projects });
}

// POST /api/projects — 새 프로젝트 생성 (+ Sweetbook book 생성 시도)
export async function POST(req: NextRequest) {
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

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
			characterImages,
			bookSpecUid,
			coverTemplateUid,
			contentTemplateUid,
			coverTemplateOverrides,
			contentTemplateOverrides,
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
				userId: user.id,
				title: normalizedTitle,
				bookSpecUid:
					typeof bookSpecUid === "string" ? bookSpecUid : undefined,
				coverTemplateUid:
					typeof coverTemplateUid === "string"
						? coverTemplateUid
						: undefined,
				contentTemplateUid:
					typeof contentTemplateUid === "string"
						? contentTemplateUid
						: undefined,
				coverTemplateOverrides,
				contentTemplateOverrides,
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
			userId: user.id,
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
			characterImages: Array.isArray(characterImages)
				? (
						characterImages as Array<{
							name: string;
							imageUrl: string;
						}>
					).filter(
						(item) =>
							item &&
							typeof item.name === "string" &&
							typeof item.imageUrl === "string",
					)
				: undefined,
			bookSpecUid:
				typeof bookSpecUid === "string" ? bookSpecUid : undefined,
			coverTemplateUid:
				typeof coverTemplateUid === "string"
					? coverTemplateUid
					: undefined,
			contentTemplateUid:
				typeof contentTemplateUid === "string"
					? contentTemplateUid
					: undefined,
			coverTemplateOverrides,
			contentTemplateOverrides,
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
