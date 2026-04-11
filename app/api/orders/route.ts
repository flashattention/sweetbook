import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";
import { normalizeOrderStatus } from "@/lib/order-status";
import type { ShippingInfo } from "@/types";

// POST /api/orders
// body: { projectId, bookUid, quantity, shipping }
export async function POST(req: NextRequest) {
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const {
			projectId,
			bookUid,
			quantity = 1,
			shipping,
		} = (await req.json()) as {
			projectId: string;
			bookUid: string;
			quantity: number;
			shipping: ShippingInfo;
		};

		if (!projectId || !bookUid) {
			return NextResponse.json(
				{ success: false, error: "projectId, bookUid가 필요합니다." },
				{ status: 400 },
			);
		}
		if (
			!shipping?.recipientName ||
			!shipping?.recipientPhone ||
			!shipping?.address1
		) {
			return NextResponse.json(
				{ success: false, error: "배송 정보가 불완전합니다." },
				{ status: 400 },
			);
		}

		const project = await prisma.project.findFirst({
			where: {
				id: projectId,
				OR: [{ userId: user.id }, { isDefault: true }],
			},
			select: {
				projectType: true,
				status: true,
				bookUid: true,
			},
		});
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}
		if (project.status === "DRAFT") {
			return NextResponse.json(
				{
					success: false,
					error: "출판이 완료되지 않은 프로젝트입니다. 먼저 출판을 완료해 주세요.",
				},
				{ status: 400 },
			);
		}
		if (!project.bookUid) {
			return NextResponse.json(
				{
					success: false,
					error: "Book UID가 없습니다. 메인에서 출판 재시도를 진행해 주세요.",
				},
				{ status: 400 },
			);
		}
		if (project.bookUid !== bookUid) {
			return NextResponse.json(
				{
					success: false,
					error: "프로젝트의 Book UID와 요청 값이 일치하지 않습니다.",
				},
				{ status: 400 },
			);
		}

		let orderUid: string;
		let orderStatus: "PENDING" | "PROCESSING" | "SHIPPING" | "DELIVERED" =
			"PENDING";
		let trackingInfo: string | null = null;

		if (!isSweetbookConfigured()) {
			// Demo 모드: 가짜 orderUid 생성
			orderUid = `demo-order-${Date.now()}`;
		} else {
			const client = getSweetbookClient();
			const order = (await client.orders.create({
				items: [{ bookUid, quantity }],
				shipping: {
					recipientName: shipping.recipientName,
					recipientPhone: shipping.recipientPhone,
					postalCode: shipping.postalCode,
					address1: shipping.address1,
					address2: shipping.address2 || "",
					shippingMemo: shipping.shippingMemo || "",
				},
				externalRef: projectId,
			})) as {
				orderUid?: string;
				orderStatus?: string | number;
				orderStatusDisplay?: string;
				trackingNumber?: string;
			};
			orderUid = order.orderUid || `order-${Date.now()}`;
			trackingInfo = order.trackingNumber || null;
			orderStatus = normalizeOrderStatus(
				order.orderStatus,
				order.orderStatusDisplay,
				order.trackingNumber,
				"PENDING",
			);
		}

		// DB에 주문 정보 저장
		await prisma.project.update({
			where: { id: projectId },
			data: { orderUid, orderStatus, trackingInfo, status: "ORDERED" },
		});

		// 홈 페이지 캐시 무효화 (주문 후 홈으로 돌아갔을 때 최신 상태 반영)
		revalidatePath("/");

		return NextResponse.json({ success: true, data: { orderUid } });
	} catch (err) {
		console.error("[POST /api/orders]", err);
		return NextResponse.json(
			{
				success: false,
				error: err instanceof Error ? err.message : "주문 실패",
			},
			{ status: 500 },
		);
	}
}

// GET /api/orders — 주문 목록 (로컬)
export async function GET(req: NextRequest) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	const projects = await prisma.project.findMany({
		where: { orderUid: { not: null }, userId: user.id },
		select: {
			id: true,
			title: true,
			orderUid: true,
			orderStatus: true,
			updatedAt: true,
		},
		orderBy: { updatedAt: "desc" },
	});
	return NextResponse.json({ success: true, data: projects });
}
