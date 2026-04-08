import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/projects — 프로젝트 목록
export async function GET() {
	const projects = await prisma.project.findMany({
		include: { pages: { orderBy: { pageOrder: "asc" } } },
		orderBy: { updatedAt: "desc" },
	});
	return NextResponse.json({ success: true, data: projects });
}

// POST /api/projects — 새 프로젝트 생성 (+ Sweetbook book 생성 시도)
export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { title, coupleNameA, coupleNameB, anniversaryDate } = body;

		if (!title || !coupleNameA || !coupleNameB || !anniversaryDate) {
			return NextResponse.json(
				{ success: false, error: "필수 항목이 누락되었습니다." },
				{ status: 400 },
			);
		}

		// 로컬 DB에 프로젝트 생성
		const project = await prisma.project.create({
			data: {
				title,
				coupleNameA,
				coupleNameB,
				anniversaryDate: new Date(anniversaryDate),
			},
			include: { pages: true },
		});

		// Sweetbook Book 생성 시도 (API 키가 있을 때만)
		let bookUid: string | null = null;
		try {
			const { getSweetbookClient } = await import("@/lib/sweetbook-api");
			const client = getSweetbookClient();
			const book = (await client.books.create({
				bookSpecUid: "SQUAREBOOK_HC",
				title,
				creationType: "NORMAL",
			})) as { bookUid?: string };
			bookUid = book.bookUid || null;

			if (bookUid) {
				await prisma.project.update({
					where: { id: project.id },
					data: { bookUid },
				});
			}
		} catch {
			// API 키 없거나 오류 → bookUid는 나중에 publish 시 생성
		}

		return NextResponse.json(
			{ success: true, data: { ...project, bookUid } },
			{ status: 201 },
		);
	} catch (err) {
		console.error("[POST /api/projects]", err);
		return NextResponse.json(
			{ success: false, error: "프로젝트 생성 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
