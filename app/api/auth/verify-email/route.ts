import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/auth/verify-email
export async function POST(req: NextRequest) {
	try {
		const { email: rawEmail, code } = (await req.json()) as {
			email?: string;
			code?: string;
		};
		const email = (rawEmail || "").trim().toLowerCase();
		const trimmedCode = (code || "").trim();

		if (!email || !trimmedCode) {
			return NextResponse.json(
				{
					success: false,
					error: "이메일과 인증 코드를 입력해 주세요.",
				},
				{ status: 400 },
			);
		}

		const record = await (prisma as any).emailVerification.findFirst({
			where: { email, verified: false },
			orderBy: { createdAt: "desc" },
		});

		if (!record) {
			return NextResponse.json(
				{ success: false, error: "인증 코드를 먼저 요청해 주세요." },
				{ status: 400 },
			);
		}

		if (new Date() > record.expiresAt) {
			return NextResponse.json(
				{
					success: false,
					error: "인증 코드가 만료되었습니다. 다시 요청해 주세요.",
				},
				{ status: 400 },
			);
		}

		if (record.code !== trimmedCode) {
			return NextResponse.json(
				{ success: false, error: "인증 코드가 올바르지 않습니다." },
				{ status: 400 },
			);
		}

		await (prisma as any).emailVerification.update({
			where: { id: record.id },
			data: { verified: true },
		});

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error("[POST /api/auth/verify-email]", err);
		return NextResponse.json(
			{ success: false, error: "인증 처리 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
