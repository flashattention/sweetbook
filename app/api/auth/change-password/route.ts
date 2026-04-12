import { NextRequest, NextResponse } from "next/server";
import {
	getAuthUserFromRequest,
	verifyPassword,
	hashPassword,
	isStrongEnoughPassword,
	getPasswordPolicyMessage,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/auth/change-password
export async function POST(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "인증이 필요합니다." },
			{ status: 401 },
		);
	}

	const body = (await req.json()) as {
		oldPassword?: string;
		newPassword?: string;
		confirmPassword?: string;
	};

	const oldPassword = String(body.oldPassword || "");
	const newPassword = String(body.newPassword || "");
	const confirmPassword = String(body.confirmPassword || "");

	if (!oldPassword) {
		return NextResponse.json(
			{ success: false, error: "현재 비밀번호를 입력해 주세요." },
			{ status: 400 },
		);
	}

	if (!isStrongEnoughPassword(newPassword)) {
		return NextResponse.json(
			{ success: false, error: getPasswordPolicyMessage() },
			{ status: 400 },
		);
	}

	if (newPassword !== confirmPassword) {
		return NextResponse.json(
			{
				success: false,
				error: "새 비밀번호 확인 값이 일치하지 않습니다.",
			},
			{ status: 400 },
		);
	}

	const dbUser = await prisma.user.findUnique({
		where: { id: user.id },
		select: { passwordHash: true },
	});

	if (!dbUser || !(await verifyPassword(oldPassword, dbUser.passwordHash))) {
		return NextResponse.json(
			{ success: false, error: "현재 비밀번호가 올바르지 않습니다." },
			{ status: 400 },
		);
	}

	const newHash = await hashPassword(newPassword);
	await prisma.user.update({
		where: { id: user.id },
		data: { passwordHash: newHash },
	});

	return NextResponse.json({ success: true });
}
