import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";
import { normalizeOrderStatus } from "@/lib/order-status";

// GET /api/orders/[orderUid]
export async function GET(
	req: NextRequest,
	{ params }: { params: { orderUid: string } },
) {
	const user = await getAuthUserFromRequest(req);
	if (!user) {
		return NextResponse.json(
			{ success: false, error: "로그인이 필요합니다." },
			{ status: 401 },
		);
	}

	// 로컬 DB에서 먼저 조회
	const project = await prisma.project.findFirst({
		where: { orderUid: params.orderUid, userId: user.id },
	});

	// Sweetbook API에서 최신 상태 조회
	let sweetbookOrder: Record<string, unknown> | null = null;
	if (isSweetbookConfigured() && !params.orderUid.startsWith("demo-")) {
		try {
			const client = getSweetbookClient();
			sweetbookOrder = (await client.orders.get(
				params.orderUid,
			)) as Record<string, unknown>;

			// 상태 동기화
			if (sweetbookOrder && project) {
				const newStatus = normalizeOrderStatus(
					sweetbookOrder.orderStatus,
					sweetbookOrder.orderStatusDisplay,
					sweetbookOrder.trackingNumber,
					(project.orderStatus as
						| "PENDING"
						| "PROCESSING"
						| "SHIPPING"
						| "DELIVERED"
						| null) || "PENDING",
				);
				const trackingInfo =
					(sweetbookOrder.trackingNumber as string) ||
					project.trackingInfo;
				if (
					newStatus !== project.orderStatus ||
					trackingInfo !== project.trackingInfo
				) {
					await prisma.project.update({
						where: { id: project.id },
						data: {
							orderStatus: newStatus,
							trackingInfo: trackingInfo ?? undefined,
						},
					});
				}
			}
		} catch {
			// API 오류 무시, 로컬 데이터로 폴백
		}
	}

	if (!project) {
		return NextResponse.json(
			{ success: false, error: "주문을 찾을 수 없습니다." },
			{ status: 404 },
		);
	}

	return NextResponse.json({
		success: true,
		data: {
			...project,
			sweetbookOrder,
		},
	});
}
