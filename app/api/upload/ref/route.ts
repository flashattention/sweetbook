import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { getAuthUserFromRequest } from "@/lib/auth";

function getSupabaseAdmin() {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error("Supabase env vars missing");
	return createClient(url, key);
}

// POST /api/upload/ref — 캐릭터 참조 이미지 업로드 (projectId 불필요)
export async function POST(req: NextRequest) {
	try {
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

		const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			return NextResponse.json(
				{
					success: false,
					error: "JPEG, PNG, WebP 파일만 업로드 가능합니다.",
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

		const ext =
			file.type === "image/png"
				? "png"
				: file.type === "image/webp"
					? "webp"
					: "jpg";
		const fileName = `character-refs/${user.id}/${uuidv4()}.${ext}`;

		const buffer = Buffer.from(await file.arrayBuffer());
		const supabase = getSupabaseAdmin();

		const { error } = await supabase.storage
			.from("uploads")
			.upload(fileName, buffer, {
				contentType: file.type,
				upsert: false,
			});

		if (error) {
			throw new Error(`업로드 실패: ${error.message}`);
		}

		const {
			data: { publicUrl },
		} = supabase.storage.from("uploads").getPublicUrl(fileName);

		return NextResponse.json({ success: true, url: publicUrl });
	} catch (err) {
		console.error("[POST /api/upload/ref]", err);
		return NextResponse.json(
			{ success: false, error: "업로드 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
