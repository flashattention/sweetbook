import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// GET /api/community/[postId]/comments (비로그인도 가능)
export async function GET(
	req: NextRequest,
	{ params }: { params: { postId: string } },
) {
	const user = await getAuthUserFromRequest(req).catch(() => null);

	// 최상위 댓글만 가져오고 replies는 중첩으로
	const replyLikesSelect = user
		? { likes: { where: { userId: user.id }, select: { id: true } } }
		: {};
	const comments = await prisma.comment.findMany({
		where: { postId: params.postId, parentId: null },
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			content: true,
			createdAt: true,
			user: { select: { id: true, name: true } },
			_count: { select: { likes: true } },
			...replyLikesSelect,
			replies: {
				orderBy: { createdAt: "asc" },
				select: {
					id: true,
					content: true,
					createdAt: true,
					user: { select: { id: true, name: true } },
					_count: { select: { likes: true } },
					...replyLikesSelect,
				},
			},
		},
	});

	return NextResponse.json({
		success: true,
		data: comments.map((c: any) => ({
			...c,
			likedByMe: c.likes ? c.likes.length > 0 : false,
			likes: undefined,
			replies: c.replies.map((r: any) => ({
				...r,
				likedByMe: r.likes ? r.likes.length > 0 : false,
				likes: undefined,
			})),
		})),
	});
}

// POST /api/community/[postId]/comments
export async function POST(
	req: NextRequest,
	{ params }: { params: { postId: string } },
) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const body = await req.json().catch(() => ({}));
	const content = typeof body.content === "string" ? body.content.trim() : "";
	const parentId = typeof body.parentId === "string" ? body.parentId : null;

	if (!content || content.length > 500) {
		return NextResponse.json(
			{ success: false, error: "댓글은 1~500자 이내여야 합니다." },
			{ status: 400 },
		);
	}

	const post = await prisma.post.findUnique({
		where: { id: params.postId },
		select: { id: true },
	});
	if (!post) {
		return NextResponse.json(
			{ success: false, error: "게시글을 찾을 수 없습니다." },
			{ status: 404 },
		);
	}

	if (parentId) {
		const parent = await prisma.comment.findUnique({
			where: { id: parentId },
			select: { postId: true, parentId: true },
		});
		if (
			!parent ||
			parent.postId !== params.postId ||
			parent.parentId !== null
		) {
			return NextResponse.json(
				{ success: false, error: "잘못된 대댓글 요청입니다." },
				{ status: 400 },
			);
		}
	}

	const comment = await prisma.comment.create({
		data: { userId: user.id, postId: params.postId, parentId, content },
		select: {
			id: true,
			content: true,
			createdAt: true,
			parentId: true,
			user: { select: { id: true, name: true } },
			_count: { select: { likes: true } },
		},
	});

	return NextResponse.json(
		{ success: true, data: { ...comment, likedByMe: false, replies: [] } },
		{ status: 201 },
	);
}
