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

// POST /api/upload — 사진 파일 업로드 (Supabase Storage)
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
		const projectId = String(formData.get("projectId") || "").trim();

		if (!file) {
			return NextResponse.json(
				{ success: false, error: "파일이 없습니다." },
				{ status: 400 },
			);
		}

		if (!projectId) {
			return NextResponse.json(
				{ success: false, error: "projectId가 필요합니다." },
				{ status: 400 },
			);
		}

		const project = await prisma.project.findFirst({
			where: { id: projectId, userId: user.id },
			select: { id: true },
		});
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트 접근 권한이 없습니다." },
				{ status: 403 },
			);
		}

		// 허용 MIME 타입
		const allowedTypes = [
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/gif",
		];
		if (!allowedTypes.includes(file.type)) {
			return NextResponse.json(
				{
					success: false,
					error: "JPEG, PNG, WebP, GIF 파일만 업로드 가능합니다.",
				},
				{ status: 400 },
			);
		}

		// 파일 크기 제한 (10MB)
		if (file.size > 10 * 1024 * 1024) {
			return NextResponse.json(
				{ success: false, error: "파일 크기는 10MB 이하여야 합니다." },
				{ status: 400 },
			);
		}

		const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
		const fileName = `${projectId}/${uuidv4()}.${ext}`;
		const buffer = Buffer.from(await file.arrayBuffer());

		const supabase = getSupabaseAdmin();
		const { error: uploadError } = await supabase.storage
			.from("uploads")
			.upload(fileName, buffer, {
				contentType: file.type,
				upsert: false,
			});

		if (uploadError) {
			console.error(
				"[POST /api/upload] Supabase Storage error",
				uploadError,
			);
			return NextResponse.json(
				{
					success: false,
					error: "파일 업로드 중 오류가 발생했습니다.",
				},
				{ status: 500 },
			);
		}

		const {
			data: { publicUrl },
		} = supabase.storage.from("uploads").getPublicUrl(fileName);

		return NextResponse.json({
			success: true,
			url: publicUrl,
			fileName,
		});
	} catch (err) {
		console.error("[POST /api/upload]", err);
		return NextResponse.json(
			{ success: false, error: "파일 업로드 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
