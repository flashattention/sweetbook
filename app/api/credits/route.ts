import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import { CREDIT_PACKAGES } from "@/lib/credits";

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

// POST /api/credits — 충전 (개발/테스트용 직접 충전; 실제 결제 연동 시 별도 webhook)
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

	const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
	if (!pkg) {
		return NextResponse.json(
			{ success: false, error: "유효하지 않은 패키지입니다." },
			{ status: 400 },
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
