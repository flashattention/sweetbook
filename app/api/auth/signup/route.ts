import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
	buildSessionCookieOptions,
	createSessionToken,
	getPasswordPolicyMessage,
	hashPassword,
	isStrongEnoughPassword,
} from "@/lib/auth";

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// POST /api/auth/signup
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as {
			email?: string;
			password?: string;
			confirmPassword?: string;
			name?: string;
		};

		const email = normalizeEmail(String(body.email || ""));
		const password = String(body.password || "");
		const confirmPassword = String(body.confirmPassword || "");
		const name = typeof body.name === "string" ? body.name.trim() : "";

		if (!isValidEmail(email)) {
			return NextResponse.json(
				{ success: false, error: "유효한 이메일을 입력해 주세요." },
				{ status: 400 },
			);
		}
		if (!isStrongEnoughPassword(password)) {
			return NextResponse.json(
				{ success: false, error: getPasswordPolicyMessage() },
				{ status: 400 },
			);
		}
		if (password !== confirmPassword) {
			return NextResponse.json(
				{
					success: false,
					error: "비밀번호 확인 값이 일치하지 않습니다.",
				},
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

		// SMTP 설정 시에만 이메일 인증 확인
		const smtpConfigured =
			!!process.env.SMTP_HOST &&
			!!process.env.SMTP_USER &&
			!!process.env.SMTP_PASS;
		if (smtpConfigured) {
			const verification = await (
				prisma as any
			).emailVerification.findFirst({
				where: { email, verified: true },
				orderBy: { createdAt: "desc" },
			});
			if (
				!verification ||
				new Date() >
					new Date(verification.expiresAt.getTime() + 10 * 60 * 1000)
			) {
				return NextResponse.json(
					{
						success: false,
						error: "이메일 인증을 먼저 완료해 주세요.",
					},
					{ status: 400 },
				);
			}
		}

		const passwordHash = await hashPassword(password);
		const user = await prisma.user.create({
			data: {
				email,
				passwordHash,
				name: name || null,
				emailVerified: true,
			},
			select: { id: true, email: true, name: true },
		});

		// 사용된 인증 레코드 정리
		await (prisma as any).emailVerification.deleteMany({
			where: { email },
		});

		const token = createSessionToken(user.id);
		const response = NextResponse.json({ success: true, data: user });
		response.cookies.set("sb_session", token, buildSessionCookieOptions());
		return response;
	} catch (err) {
		console.error("[POST /api/auth/signup]", err);
		return NextResponse.json(
			{ success: false, error: "회원가입 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
