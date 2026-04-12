import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

const PAGE_SIZE = 20;

// GET /api/community?q=검색어&cursor=xxx (비로그인도 가능)
export async function GET(req: NextRequest) {
	const user = await getAuthUserFromRequest(req).catch(() => null);

	const { searchParams } = req.nextUrl;
	const q = searchParams.get("q")?.trim() || "";
	const cursor = searchParams.get("cursor") || undefined;

	const where = q
		? {
				OR: [
					{
						project: {
							title: {
								contains: q,
								mode: "insensitive" as const,
							},
						},
					},
					{
						description: {
							contains: q,
							mode: "insensitive" as const,
						},
					},
					{
						user: {
							name: { contains: q, mode: "insensitive" as const },
						},
					},
				],
			}
		: {};

	const posts = await prisma.post.findMany({
		where,
		orderBy: { createdAt: "desc" },
		take: PAGE_SIZE + 1,
		...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
		select: {
			id: true,
			description: true,
			projectType: true,
			createdAt: true,
			user: { select: { id: true, name: true } },
			project: {
				select: {
					title: true,
					coverImageUrl: true,
					genre: true,
					_count: { select: { pages: true } },
				},
			},
			_count: { select: { likes: true, comments: true } },
			...(user
				? {
						likes: {
							where: { userId: user.id },
							select: { id: true },
						},
					}
				: {}),
		},
	});

	const hasMore = posts.length > PAGE_SIZE;
	const items = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
	const nextCursor = hasMore ? items[items.length - 1].id : null;

	return NextResponse.json({
		success: true,
		data: items.map((p: any) => ({
			...p,
			likedByMe: p.likes ? p.likes.length > 0 : false,
			likes: undefined,
		})),
		nextCursor,
	});
}

// POST /api/community — 프로젝트를 공유 피드에 업로드
export async function POST(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const body = await req.json().catch(() => ({}));
	const { projectId, description } = body as {
		projectId?: string;
		description?: string;
	};

	if (!projectId) {
		return NextResponse.json(
			{ success: false, error: "projectId가 필요합니다." },
			{ status: 400 },
		);
	}

	const project = await prisma.project.findFirst({
		where: { id: projectId, userId: user.id, status: "PUBLISHED" },
		select: { id: true, projectType: true },
	});
	if (!project) {
		return NextResponse.json(
			{ success: false, error: "출판된 프로젝트만 공유할 수 있습니다." },
			{ status: 404 },
		);
	}

	if (!["COMIC", "NOVEL"].includes(project.projectType)) {
		return NextResponse.json(
			{
				success: false,
				error: "만화 또는 소설 프로젝트만 공유할 수 있습니다.",
			},
			{ status: 400 },
		);
	}

	const existing = await prisma.post.findUnique({ where: { projectId } });
	if (existing) {
		return NextResponse.json(
			{ success: false, error: "이미 공유된 프로젝트입니다." },
			{ status: 409 },
		);
	}

	const sanitizedDescription =
		typeof description === "string"
			? description.trim().slice(0, 500)
			: undefined;

	const post = await prisma.post.create({
		data: {
			userId: user.id,
			projectId,
			projectType: project.projectType,
			description: sanitizedDescription || null,
		},
		select: { id: true },
	});

	return NextResponse.json(
		{ success: true, data: { id: post.id } },
		{ status: 201 },
	);
}
