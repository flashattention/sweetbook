import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// GET /api/community/[postId] (비로그인도 가능)
export async function GET(
	req: NextRequest,
	{ params }: { params: { postId: string } },
) {
	const user = await getAuthUserFromRequest(req).catch(() => null);

	const post = await prisma.post.findUnique({
		where: { id: params.postId },
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
					synopsis: true,
					comicStyle: true,
					pages: {
						orderBy: { pageOrder: "asc" },
						select: {
							id: true,
							pageOrder: true,
							imageUrl: true,
							caption: true,
						},
					},
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

	if (!post) {
		return NextResponse.json(
			{ success: false, error: "게시글을 찾을 수 없습니다." },
			{ status: 404 },
		);
	}

	return NextResponse.json({
		success: true,
		data: {
			...post,
			likedByMe: (post as any).likes
				? (post as any).likes.length > 0
				: false,
			likes: undefined,
		},
	});
}

// DELETE /api/community/[postId]
export async function DELETE(
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
		select: { userId: true },
	});
	if (!post) {
		return NextResponse.json(
			{ success: false, error: "게시글을 찾을 수 없습니다." },
			{ status: 404 },
		);
	}
	if (post.userId !== user.id) {
		return NextResponse.json(
			{ success: false, error: "권한이 없습니다." },
			{ status: 403 },
		);
	}

	await prisma.post.delete({ where: { id: params.postId } });
	return NextResponse.json({ success: true });
}
