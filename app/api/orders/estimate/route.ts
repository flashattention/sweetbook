import { NextRequest, NextResponse } from "next/server";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";

function pickFirstNumber(...values: unknown[]): number | null {
	for (const v of values) {
		if (typeof v === "number" && Number.isFinite(v)) return v;
	}
	return null;
}

function pickFirstString(...values: unknown[]): string | null {
	for (const v of values) {
		if (typeof v === "string" && v.trim()) return v;
	}
	return null;
}

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
			data: {
				totalPrice: 39000 * quantity,
				unitPrice: 39000,
				itemAmount: 39000 * quantity,
				shippingFee: 0,
				currency: "KRW",
			},
		});
	}

	try {
		const client = getSweetbookClient();
		const result = (await client.orders.estimate({
			items: [{ bookUid, quantity }],
		})) as Record<string, unknown>;

		const firstItem = Array.isArray(result.items)
			? (result.items[0] as Record<string, unknown> | undefined)
			: undefined;

		const unitPrice = pickFirstNumber(
			firstItem?.unitPrice,
			result.unitPrice,
		);
		const itemAmount = pickFirstNumber(
			firstItem?.itemAmount,
			result.itemAmount,
			unitPrice !== null ? unitPrice * quantity : null,
		);
		const shippingFee =
			pickFirstNumber(result.shippingFee, firstItem?.shippingFee) ?? 0;

		const totalPrice = pickFirstNumber(
			result.totalPrice,
			result.totalAmount,
			result.price,
			result.amount,
			result.finalPrice,
			itemAmount !== null ? itemAmount + shippingFee : null,
		);
		const currency =
			pickFirstString(result.currency, result.currencyCode) || "KRW";

		return NextResponse.json({
			success: true,
			data: {
				totalPrice,
				unitPrice,
				itemAmount,
				shippingFee,
				currency,
				raw: result,
			},
		});
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
