import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// POST /api/community/[postId]/like — 좋아요 토글
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

	const existing = await prisma.postLike.findUnique({
		where: { userId_postId: { userId: user.id, postId: params.postId } },
	});

	if (existing) {
		await prisma.postLike.delete({ where: { id: existing.id } });
		const count = await prisma.postLike.count({
			where: { postId: params.postId },
		});
		return NextResponse.json({ success: true, liked: false, count });
	} else {
		await prisma.postLike.create({
			data: { userId: user.id, postId: params.postId },
		});
		const count = await prisma.postLike.count({
			where: { postId: params.postId },
		});
		return NextResponse.json({ success: true, liked: true, count });
	}
}
