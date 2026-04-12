import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

function isValidEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// POST /api/auth/send-verification
export async function POST(req: NextRequest) {
	try {
		const { email: rawEmail } = (await req.json()) as { email?: string };
		const email = (rawEmail || "").trim().toLowerCase();

		if (!isValidEmail(email)) {
			return NextResponse.json(
				{ success: false, error: "유효한 이메일을 입력해 주세요." },
				{ status: 400 },
			);
		}

		const exists = await prisma.user.findUnique({ where: { email } });
		if (exists) {
			return NextResponse.json(
				{ success: false, error: "이미 가입된 이메일입니다." },
				{ status: 409 },
			);
		}

		// SMTP 미설정 시 이메일 인증 건너뜀
		if (
			!process.env.SMTP_HOST ||
			!process.env.SMTP_USER ||
			!process.env.SMTP_PASS
		) {
			return NextResponse.json({ success: true, smtpDisabled: true });
		}

		// 기존 인증 레코드 삭제
		await (prisma as any).emailVerification.deleteMany({
			where: { email },
		});

		// 6자리 코드 생성
		const code = String(Math.floor(100000 + Math.random() * 900000));
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

		await (prisma as any).emailVerification.create({
			data: { email, code, expiresAt },
		});

		await sendVerificationEmail(email, code);

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error("[POST /api/auth/send-verification]", err);
		return NextResponse.json(
			{ success: false, error: "인증 코드 발송 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
