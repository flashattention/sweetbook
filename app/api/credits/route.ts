import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import { CREDIT_PACKAGES } from "@/lib/credits";

function isAdminPassword(input: unknown): boolean {
	const secret = process.env.ADMIN_CHARGE_PASSWORD;
	if (!secret) return false;
	if (typeof input !== "string" || input.length === 0) return false;
	try {
		const a = Buffer.from(input);
		const b = Buffer.from(secret);
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

// GET /api/credits — 잔액 + 최근 내역 20건
export async function GET(req: NextRequest) {
	const user = await getAuthUserFromRequest(req).catch(() => null);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const [userData, txns] = await Promise.all([
		(prisma.user as any).findUnique({
			where: { id: user.id },
			select: { credits: true },
		}),
		(prisma as any).creditTransaction.findMany({
			where: { userId: user.id },
			orderBy: { createdAt: "desc" },
			take: 30,
			select: {
				id: true,
				amount: true,
				reason: true,
				projectId: true,
				createdAt: true,
			},
		}),
	]);

	return NextResponse.json({
		success: true,
		data: {
			credits: userData?.credits ?? 0,
			transactions: txns,
			packages: CREDIT_PACKAGES,
		},
	});
}

// POST /api/credits — 충전
// adminPassword 가 일치하면 결제 없이 무료 충전 (관리자 전용)
export async function POST(req: NextRequest) {
	const user = await getAuthUserFromRequest(req).catch(() => null);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const body = await req.json().catch(() => ({}));
	const packageId = body?.packageId as string | undefined;
	const adminPassword = body?.adminPassword;

	const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
	if (!pkg) {
		return NextResponse.json(
			{ success: false, error: "유효하지 않은 패키지입니다." },
			{ status: 400 },
		);
	}

	// 관리자 암호 불일치 시 결제 불가 (현재 결제 미연동이므로 비관리자는 차단)
	if (!isAdminPassword(adminPassword)) {
		return NextResponse.json(
			{ success: false, error: "결제 기능이 준비 중입니다." },
			{ status: 403 },
		);
	}

	const [updated] = await (prisma as any).$transaction([
		(prisma.user as any).update({
			where: { id: user.id },
			data: { credits: { increment: pkg.credits } },
			select: { credits: true },
		}),
		(prisma as any).creditTransaction.create({
			data: {
				userId: user.id,
				amount: pkg.credits,
				reason: "CHARGE",
			},
		}),
	]);

	return NextResponse.json({
		success: true,
		data: { credits: updated.credits, charged: pkg.credits },
	});
}
