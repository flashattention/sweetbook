import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// POST /api/projects/[id]/pages/reorder
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
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

		const { order } = (await req.json()) as { order: string[] };
		// order: 페이지 id 배열 (원하는 순서대로)
		for (let i = 0; i < order.length; i++) {
			await prisma.page.updateMany({
				where: { id: order[i], projectId: params.id },
				data: { pageOrder: i + 1 },
			});
		}
		return NextResponse.json({ success: true });
	} catch (err) {
		console.error("[POST /pages/reorder]", err);
		return NextResponse.json(
			{ success: false, error: "순서 변경 실패" },
			{ status: 500 },
		);
	}
}
