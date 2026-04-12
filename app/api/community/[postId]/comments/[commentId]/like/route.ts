import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// POST /api/community/[postId]/comments/[commentId]/like — 좋아요 토글
export async function POST(
	req: NextRequest,
	{ params }: { params: { postId: string; commentId: string } },
) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const comment = await prisma.comment.findUnique({
		where: { id: params.commentId },
		select: { postId: true },
	});
	if (!comment || comment.postId !== params.postId) {
		return NextResponse.json(
			{ success: false, error: "댓글을 찾을 수 없습니다." },
			{ status: 404 },
		);
	}

	const existing = await prisma.commentLike.findUnique({
		where: {
			userId_commentId: { userId: user.id, commentId: params.commentId },
		},
	});

	if (existing) {
		await prisma.commentLike.delete({ where: { id: existing.id } });
		const count = await prisma.commentLike.count({
			where: { commentId: params.commentId },
		});
		return NextResponse.json({ success: true, liked: false, count });
	} else {
		await prisma.commentLike.create({
			data: { userId: user.id, commentId: params.commentId },
		});
		const count = await prisma.commentLike.count({
			where: { commentId: params.commentId },
		});
		return NextResponse.json({ success: true, liked: true, count });
	}
}
