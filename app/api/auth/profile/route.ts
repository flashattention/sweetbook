import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/auth/profile
export async function GET(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "인증이 필요합니다." },
			{ status: 401 },
		);
	}
	const profile = await (prisma as any).user.findUnique({
		where: { id: user.id },
		select: {
			id: true,
			email: true,
			name: true,
			avatarUrl: true,
			createdAt: true,
		},
	});
	return NextResponse.json({ success: true, data: profile });
}

// PATCH /api/auth/profile
export async function PATCH(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "인증이 필요합니다." },
			{ status: 401 },
		);
	}

	const body = (await req.json()) as { name?: string; avatarUrl?: string };
	const name = typeof body.name === "string" ? body.name.trim() : undefined;
	const avatarUrl =
		typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : undefined;

	if (name !== undefined && name.length > 50) {
		return NextResponse.json(
			{ success: false, error: "이름은 50자 이내여야 합니다." },
			{ status: 400 },
		);
	}

	const updated = await (prisma as any).user.update({
		where: { id: user.id },
		data: {
			...(name !== undefined && { name: name || null }),
			...(avatarUrl !== undefined && { avatarUrl }),
		},
		select: { id: true, email: true, name: true, avatarUrl: true },
	});

	return NextResponse.json({ success: true, data: updated });
}
