import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";

// GET /api/auth/me
export async function GET(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "인증되지 않았습니다." },
			{ status: 401 },
		);
	}
	return NextResponse.json({ success: true, data: user });
}
