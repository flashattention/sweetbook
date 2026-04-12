import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { getAuthUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function getSupabaseAdmin() {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error("Supabase env vars missing");
	return createClient(url, key);
}

// POST /api/auth/avatar
export async function POST(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const formData = await req.formData();
	const file = formData.get("file") as File | null;

	if (!file) {
		return NextResponse.json(
			{ success: false, error: "파일이 없습니다." },
			{ status: 400 },
		);
	}

	const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
	if (!allowed.includes(file.type)) {
		return NextResponse.json(
			{
				success: false,
				error: "JPG, PNG, WebP, GIF 파일만 업로드 가능합니다.",
			},
			{ status: 400 },
		);
	}

	if (file.size > 5 * 1024 * 1024) {
		return NextResponse.json(
			{ success: false, error: "파일 크기는 5MB 이하여야 합니다." },
			{ status: 400 },
		);
	}

	const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
	const filename = `avatars/${user.id}/${uuidv4()}.${ext}`;

	const supabase = getSupabaseAdmin();
	const arrayBuffer = await file.arrayBuffer();
	const { error } = await supabase.storage
		.from("uploads")
		.upload(filename, arrayBuffer, {
			contentType: file.type,
			upsert: true,
		});

	if (error) {
		console.error("[POST /api/auth/avatar] upload error:", error);
		return NextResponse.json(
			{ success: false, error: "업로드에 실패했습니다." },
			{ status: 500 },
		);
	}

	const { data: urlData } = supabase.storage
		.from("uploads")
		.getPublicUrl(filename);
	const avatarUrl = urlData.publicUrl;

	await (prisma as any).user.update({
		where: { id: user.id },
		data: { avatarUrl },
	});

	return NextResponse.json({ success: true, data: { avatarUrl } });
}
