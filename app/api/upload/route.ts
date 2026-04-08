import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// POST /api/upload — 사진 파일 업로드 (로컬 저장)
export async function POST(req: NextRequest) {
	try {
		const formData = await req.formData();
		const file = formData.get("file") as File | null;

		if (!file) {
			return NextResponse.json(
				{ success: false, error: "파일이 없습니다." },
				{ status: 400 },
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
		const fileName = `${uuidv4()}.${ext}`;
		const uploadsDir = path.join(process.cwd(), "public", "uploads");

		if (!existsSync(uploadsDir)) {
			await mkdir(uploadsDir, { recursive: true });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(path.join(uploadsDir, fileName), buffer);

		return NextResponse.json({
			success: true,
			url: `/uploads/${fileName}`,
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
