import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/projects/[id]/pages
export async function GET(
	_req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const pages = await prisma.page.findMany({
		where: { projectId: params.id },
		orderBy: { pageOrder: "asc" },
	});
	return NextResponse.json({ success: true, data: pages });
}

// POST /api/projects/[id]/pages — 새 페이지 추가
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const body = await req.json();
		const { imageUrl, caption = "", pageOrder } = body;

		if (!imageUrl) {
			return NextResponse.json(
				{ success: false, error: "imageUrl이 필요합니다." },
				{ status: 400 },
			);
		}

		// 기존 최대 pageOrder 계산
		const maxOrder = await prisma.page.aggregate({
			where: { projectId: params.id },
			_max: { pageOrder: true },
		});
		const order = pageOrder ?? (maxOrder._max.pageOrder ?? 0) + 1;

		const page = await prisma.page.create({
			data: {
				projectId: params.id,
				imageUrl,
				caption,
				pageOrder: order,
			},
		});
		return NextResponse.json(
			{ success: true, data: page },
			{ status: 201 },
		);
	} catch (err) {
		console.error("[POST /api/projects/[id]/pages]", err);
		return NextResponse.json(
			{ success: false, error: "페이지 생성 실패" },
			{ status: 500 },
		);
	}
}
