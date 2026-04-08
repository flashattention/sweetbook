import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
	getSweetbookClient,
	isSweetbookConfigured,
	fetchImageBlob,
	postSweetbookTemplateForm,
} from "@/lib/sweetbook-api";

function getMinPagesByBookSpec(bookSpecUid: string): number {
	if (bookSpecUid === "SQUAREBOOK_HC") return 24;
	return 1;
}

/**
 * POST /api/projects/[id]/publish
 *
 * 포토북을 Sweetbook API에 전송하는 전체 흐름:
 *  1. Book 생성
 *  2. 표지 추가
 *  3. 내지 페이지 추가
 *  4. 최종화
 *  5. 로컬 DB 상태 업데이트
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	const project = await prisma.project.findUnique({
		where: { id: params.id },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
	});

	if (!project) {
		return NextResponse.json(
			{ success: false, error: "프로젝트를 찾을 수 없습니다." },
			{ status: 404 },
		);
	}

	// 멱등 처리: 이미 발행(또는 주문)된 프로젝트는 재발행하지 않고 성공으로 응답한다.
	if (
		(project.status === "PUBLISHED" || project.status === "ORDERED") &&
		project.bookUid
	) {
		return NextResponse.json({
			success: true,
			bookUid: project.bookUid,
			message: "이미 발행이 완료된 프로젝트입니다.",
		});
	}

	if (project.pages.length === 0) {
		return NextResponse.json(
			{ success: false, error: "최소 1페이지 이상 필요합니다." },
			{ status: 400 },
		);
	}

	const bookSpecUid = project.bookSpecUid || "SQUAREBOOK_HC";
	const minPages = getMinPagesByBookSpec(bookSpecUid);
	if (project.pages.length < minPages) {
		return NextResponse.json(
			{
				success: false,
				error: `${bookSpecUid} 판형은 최소 ${minPages}페이지가 필요합니다. (현재 ${project.pages.length}페이지)`,
			},
			{ status: 400 },
		);
	}

	if (!project.coverImageUrl) {
		return NextResponse.json(
			{ success: false, error: "표지 이미지를 설정해 주세요." },
			{ status: 400 },
		);
	}

	if (!isSweetbookConfigured()) {
		await prisma.project.update({
			where: { id: project.id },
			data: { status: "PUBLISHED" },
		});

		return NextResponse.json({
			success: true,
			demo: true,
			message:
				"Demo 모드: SWEETBOOK_API_KEY 미설정. 주문 페이지로 이동하지만 실제 API 호출은 생략됩니다.",
		});
	}

	try {
		const client = getSweetbookClient();

		let bookUid = project.bookUid;
		if (!bookUid) {
			const book = (await client.books.create({
				bookSpecUid,
				title: project.title,
				creationType: "NORMAL",
			})) as { bookUid?: string };

			bookUid = book.bookUid || null;
			if (!bookUid) {
				throw new Error("Book 생성 후 bookUid를 받지 못했습니다.");
			}
		}

		const coverTemplateUid =
			project.coverTemplateUid ||
			process.env.SWEETBOOK_COVER_TEMPLATE_UID;
		const contentTemplateUid =
			project.contentTemplateUid ||
			process.env.SWEETBOOK_CONTENT_TEMPLATE_UID;

		if (
			!coverTemplateUid ||
			coverTemplateUid === "YOUR_COVER_TEMPLATE_UID"
		) {
			throw new Error(
				"SWEETBOOK_COVER_TEMPLATE_UID가 설정되지 않았습니다. GET /api/templates 로 템플릿 목록을 조회한 후 .env 에 입력하세요.",
			);
		}

		if (
			!contentTemplateUid ||
			contentTemplateUid === "YOUR_CONTENT_TEMPLATE_UID"
		) {
			throw new Error(
				"SWEETBOOK_CONTENT_TEMPLATE_UID가 설정되지 않았습니다. GET /api/templates 로 템플릿 목록을 조회한 후 .env 에 입력하세요.",
			);
		}

		const coverBlob = await fetchImageBlob(
			project.coverImageUrl,
			req.nextUrl.origin,
		);
		const anniversaryDate = project.anniversaryDate
			? new Date(project.anniversaryDate)
			: new Date();
		const dateRange = `${anniversaryDate.getFullYear()}.${String(
			anniversaryDate.getMonth() + 1,
		).padStart(
			2,
			"0",
		)}.${String(anniversaryDate.getDate()).padStart(2, "0")}`;

		await postSweetbookTemplateForm(
			`/Books/${bookUid}/cover`,
			coverTemplateUid,
			{
				childName: `${project.coupleNameA} & ${project.coupleNameB}`,
				schoolName: "Momento",
				volumeLabel: "Vol.1",
				periodText: dateRange,
			},
			{ coverPhoto: coverBlob },
		);

		for (const page of project.pages) {
			const pageBlob = await fetchImageBlob(
				page.imageUrl,
				req.nextUrl.origin,
			);
			await postSweetbookTemplateForm(
				`/Books/${bookUid}/contents`,
				contentTemplateUid,
				{
					monthNum: String(anniversaryDate.getMonth() + 1).padStart(
						2,
						"0",
					),
					dayNum: String(page.pageOrder).padStart(2, "0"),
					diaryText: page.caption || "",
				},
				{ photo: pageBlob },
				{ breakBefore: "page" },
			);
		}

		await client.books.finalize(bookUid);

		await prisma.project.update({
			where: { id: project.id },
			data: { bookUid, status: "PUBLISHED" },
		});

		return NextResponse.json({ success: true, bookUid });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "알 수 없는 오류";
		console.error("[POST /api/projects/[id]/publish]", err);
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
