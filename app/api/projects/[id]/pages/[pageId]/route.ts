import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// PATCH /api/projects/[id]/pages/[pageId]
export async function PATCH(
	req: NextRequest,
	{ params }: { params: { id: string; pageId: string } },
) {
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const project = await prisma.project.findFirst({
			where: { id: params.id, userId: user.id },
			select: { id: true },
		});
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}

		const body = await req.json();
		const { imageUrl, caption, pageOrder } = body;

		const data: Record<string, unknown> = {};
		if (imageUrl !== undefined) data.imageUrl = imageUrl;
		if (caption !== undefined) data.caption = caption;
		if (pageOrder !== undefined) data.pageOrder = pageOrder;

		const page = await prisma.page.findFirst({
			where: { id: params.pageId, projectId: params.id },
		});
		if (!page) {
			return NextResponse.json(
				{ success: false, error: "페이지를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}
		const updated = await prisma.page.update({
			where: { id: page.id },
			data,
		});
		return NextResponse.json({ success: true, data: updated });
	} catch (err) {
		console.error("[PATCH /pages/[pageId]]", err);
		return NextResponse.json(
			{ success: false, error: "업데이트 실패" },
			{ status: 500 },
		);
	}
}

// DELETE /api/projects/[id]/pages/[pageId]
export async function DELETE(
	req: NextRequest,
	{ params }: { params: { id: string; pageId: string } },
) {
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const project = await prisma.project.findFirst({
			where: { id: params.id, userId: user.id },
			select: { id: true },
		});
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}

		await prisma.page.deleteMany({
			where: { id: params.pageId, projectId: params.id },
		});

		// pageOrder 재정렬
		const remaining = await prisma.page.findMany({
			where: { projectId: params.id },
			orderBy: { pageOrder: "asc" },
		});
		for (let i = 0; i < remaining.length; i++) {
			await prisma.page.update({
				where: { id: remaining[i].id },
				data: { pageOrder: i + 1 },
			});
		}
		return NextResponse.json({ success: true });
	} catch (err) {
		console.error("[DELETE /pages/[pageId]]", err);
		return NextResponse.json(
			{ success: false, error: "삭제 실패" },
			{ status: 500 },
		);
	}
}
