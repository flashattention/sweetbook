import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/projects/[id]
export async function GET(
	_req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const project = await prisma.project.findUnique({
		where: { id: params.id },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
	});
	if (!project) {
		return NextResponse.json(
			{ success: false, error: "프로젝트를 찾을 수 없습니다." },
			{ status: 404 },
		);
	}
	return NextResponse.json({ success: true, data: project });
}

// PATCH /api/projects/[id] — 부분 업데이트 (표지, 제목 등)
export async function PATCH(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const body = await req.json();
		// allowlist: 변경 허용 필드
		const allowed = [
			"title",
			"coupleNameA",
			"coupleNameB",
			"anniversaryDate",
			"coverImageUrl",
			"coverCaption",
			"coverTemplateUid",
			"contentTemplateUid",
			"bookUid",
			"orderUid",
			"orderStatus",
			"trackingInfo",
			"status",
		];
		const data: Record<string, unknown> = {};
		for (const key of allowed) {
			if (key in body) {
				data[key] =
					key === "anniversaryDate"
						? new Date(body[key] as string)
						: body[key];
			}
		}
		const updated = await prisma.project.update({
			where: { id: params.id },
			data,
			include: { pages: { orderBy: { pageOrder: "asc" } } },
		});
		return NextResponse.json({ success: true, data: updated });
	} catch (err) {
		console.error("[PATCH /api/projects/[id]]", err);
		return NextResponse.json(
			{ success: false, error: "업데이트 실패" },
			{ status: 500 },
		);
	}
}

// DELETE /api/projects/[id]
export async function DELETE(
	_req: NextRequest,
	{ params }: { params: { id: string } },
) {
	await prisma.project.delete({ where: { id: params.id } });
	return NextResponse.json({ success: true });
}
