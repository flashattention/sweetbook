const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const prisma = new PrismaClient();

async function main() {
	// page overrides에 /uploads/ 경로 확인
	const pages = await prisma.page.findMany({
		where: { contentTemplateOverrides: { contains: "/uploads/" } },
		select: { id: true, contentTemplateOverrides: true },
		take: 3,
	});
	console.log("pages with /uploads/ in overrides:", pages.length);
	if (pages[0]) console.log(pages[0].contentTemplateOverrides?.slice(0, 300));

	// project overrides에도 확인
	const projects = await prisma.project.findMany({
		where: { coverTemplateOverrides: { contains: "/uploads/" } },
		select: { id: true, coverTemplateOverrides: true },
		take: 3,
	});
	console.log("projects with /uploads/ in overrides:", projects.length);

	// page imageUrl 샘플
	const pageUrls = await prisma.page.findMany({
		select: { imageUrl: true },
		take: 3,
	});
	console.log(
		"page imageUrl samples:",
		pageUrls.map((p) => p.imageUrl),
	);

	await prisma.$disconnect();
}

main().catch(console.error);
