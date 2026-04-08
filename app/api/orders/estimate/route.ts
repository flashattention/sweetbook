import { NextRequest, NextResponse } from "next/server";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";

// POST /api/orders/estimate
// body: { bookUid: string; quantity: number }
export async function POST(req: NextRequest) {
	const { bookUid, quantity = 1 } = await req.json();

	if (!bookUid) {
		return NextResponse.json(
			{ success: false, error: "bookUid가 필요합니다." },
			{ status: 400 },
		);
	}

	if (!isSweetbookConfigured()) {
		// Demo 모드: 더미 금액 반환
		return NextResponse.json({
			success: true,
			demo: true,
			data: { totalPrice: 39000 * quantity, currency: "KRW" },
		});
	}

	try {
		const client = getSweetbookClient();
		const result = (await client.orders.estimate({
			items: [{ bookUid, quantity }],
		})) as { totalPrice?: number; currency?: string };

		return NextResponse.json({ success: true, data: result });
	} catch (err) {
		console.error("[POST /api/orders/estimate]", err);
		return NextResponse.json(
			{
				success: false,
				error: err instanceof Error ? err.message : "견적 조회 실패",
			},
			{ status: 500 },
		);
	}
}
