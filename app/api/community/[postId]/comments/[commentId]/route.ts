import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// DELETE /api/community/[postId]/comments/[commentId]
export async function DELETE(
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
		select: { userId: true, postId: true },
	});
	if (!comment || comment.postId !== params.postId) {
		return NextResponse.json(
			{ success: false, error: "댓글을 찾을 수 없습니다." },
			{ status: 404 },
		);
	}
	if (comment.userId !== user.id) {
		return NextResponse.json(
			{ success: false, error: "권한이 없습니다." },
			{ status: 403 },
		);
	}

	await prisma.comment.delete({ where: { id: params.commentId } });
	return NextResponse.json({ success: true });
}
