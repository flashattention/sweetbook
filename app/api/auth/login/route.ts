import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
	buildSessionCookieOptions,
	createSessionToken,
	verifyPassword,
} from "@/lib/auth";

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

// POST /api/auth/login
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as {
			email?: string;
			password?: string;
		};

		const email = normalizeEmail(String(body.email || ""));
		const password = String(body.password || "");

		if (!email || !password) {
			return NextResponse.json(
				{ success: false, error: "이메일과 비밀번호를 입력해 주세요." },
				{ status: 400 },
			);
		}

		const user = await prisma.user.findUnique({ where: { email } });
		if (!user) {
			return NextResponse.json(
				{
					success: false,
					error: "이메일 또는 비밀번호가 올바르지 않습니다.",
				},
				{ status: 401 },
			);
		}

		const valid = await verifyPassword(password, user.passwordHash);
		if (!valid) {
			return NextResponse.json(
				{
					success: false,
					error: "이메일 또는 비밀번호가 올바르지 않습니다.",
				},
				{ status: 401 },
			);
		}

		const token = createSessionToken(user.id);
		const response = NextResponse.json({
			success: true,
			data: { id: user.id, email: user.email, name: user.name },
		});
		response.cookies.set("sb_session", token, buildSessionCookieOptions());
		return response;
	} catch (err) {
		console.error("[POST /api/auth/login]", err);
		return NextResponse.json(
			{ success: false, error: "로그인 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
