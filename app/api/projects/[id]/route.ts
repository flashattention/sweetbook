import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";

// GET /api/projects/[id]
export async function GET(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const project = await prisma.project.findFirst({
		where: { id: params.id, userId: user.id },
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
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const existing = await prisma.project.findFirst({
			where: { id: params.id, userId: user.id },
			select: { id: true },
		});
		if (!existing) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}

		const body = await req.json();
		// allowlist: 변경 허용 필드
		const allowed = [
			"title",
			"projectType",
			"genre",
			"synopsis",
			"comicStyle",
			"coverImageUrl",
			"coverCaption",
			"coverTemplateUid",
			"contentTemplateUid",
			"coverTemplateOverrides",
			"contentTemplateOverrides",
			"bookUid",
			"orderUid",
			"orderStatus",
			"trackingInfo",
			"status",
		];
		const data: Record<string, unknown> = {};
		for (const key of allowed) {
			if (key in body) {
				if (
					(key === "coverTemplateOverrides" ||
						key === "contentTemplateOverrides") &&
					body[key] !== null &&
					typeof body[key] === "object"
				) {
					data[key] = JSON.stringify(body[key]);
				} else {
					data[key] = body[key];
				}
			}
		}
		const updated = await prisma.project.update({
			where: { id: existing.id },
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
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	await prisma.project.deleteMany({
		where: { id: params.id, userId: user.id },
	});
	revalidatePath("/");
	return NextResponse.json({ success: true });
}
