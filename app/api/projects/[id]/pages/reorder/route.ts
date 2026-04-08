import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/projects/[id]/pages/reorder
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
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
