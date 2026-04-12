/**
 * 로컬 public/uploads/ 파일을 Supabase Storage로 일괄 마이그레이션
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const uploadsDir = path.join(process.cwd(), "public", "uploads");

function getMime(filename) {
	const ext = path.extname(filename).toLowerCase();
	const map = {
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".webp": "image/webp",
		".gif": "image/gif",
	};
	return map[ext] || "application/octet-stream";
}

async function main() {
	const files = fs.readdirSync(uploadsDir).filter((f) => {
		const stat = fs.statSync(path.join(uploadsDir, f));
		return stat.isFile();
	});

	console.log(`마이그레이션 대상: ${files.length}개 파일`);
	let ok = 0;
	let fail = 0;
	const CONCURRENCY = 10;

	for (let i = 0; i < files.length; i += CONCURRENCY) {
		const batch = files.slice(i, i + CONCURRENCY);
		await Promise.all(
			batch.map(async (file) => {
				const buf = fs.readFileSync(path.join(uploadsDir, file));
				const { error } = await supabase.storage
					.from("uploads")
					.upload(file, buf, {
						contentType: getMime(file),
						upsert: true,
					});
				if (error) {
					console.error(`  FAIL ${file}: ${error.message}`);
					fail++;
				} else {
					process.stdout.write(".");
					ok++;
				}
			}),
		);
	}

	console.log(`\n완료: ${ok}개 성공, ${fail}개 실패`);

	// DB에서 /uploads/xxx 경로를 Supabase public URL로 업데이트
	if (ok > 0) {
		const supabaseUrl = process.env.SUPABASE_URL;
		const base = `${supabaseUrl}/storage/v1/object/public/uploads/`;
		console.log("\nDB URL 패치 중...");

		const { PrismaClient } = require("@prisma/client");
		const prisma = new PrismaClient();

		// Project.coverImageUrl
		const projects = await prisma.project.findMany({
			where: { coverImageUrl: { startsWith: "/uploads/" } },
			select: { id: true, coverImageUrl: true },
		});
		for (const p of projects) {
			const newUrl = base + p.coverImageUrl.replace("/uploads/", "");
			await prisma.project.update({
				where: { id: p.id },
				data: { coverImageUrl: newUrl },
			});
			console.log(`  Project ${p.id}: ${p.coverImageUrl} → ${newUrl}`);
		}

		// Page.imageUrl
		const pages = await prisma.page.findMany({
			where: { imageUrl: { startsWith: "/uploads/" } },
			select: { id: true, imageUrl: true },
		});
		for (const pg of pages) {
			const newUrl = base + pg.imageUrl.replace("/uploads/", "");
			await prisma.page.update({
				where: { id: pg.id },
				data: { imageUrl: newUrl },
			});
			console.log(`  Page ${pg.id}: ${pg.imageUrl} → ${newUrl}`);
		}

		await prisma.$disconnect();
		console.log("DB URL 패치 완료");
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
