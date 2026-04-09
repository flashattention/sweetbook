import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeOrderStatus } from "@/lib/order-status";

// POST /api/webhook — Sweetbook 웹훅 수신
export async function POST(req: NextRequest) {
	try {
		// 서명 검증 (선택적)
		const webhookSecret = process.env.SWEETBOOK_WEBHOOK_SECRET;
		if (webhookSecret && webhookSecret !== "your_webhook_secret") {
			const body = await req.text();
			const signature = req.headers.get("x-sweetbook-signature");
			const timestamp = req.headers.get("x-sweetbook-timestamp");

			if (!signature || !timestamp) {
				return NextResponse.json(
					{ error: "서명 헤더가 누락되었습니다." },
					{ status: 401 },
				);
			}

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { verifySignature } = require("../../../lib/webhook") as {
				verifySignature: (
					payload: string,
					sig: string,
					secret: string,
					ts: string,
				) => boolean;
			};
			if (!verifySignature(body, signature, webhookSecret, timestamp)) {
				return NextResponse.json(
					{ error: "서명 검증 실패" },
					{ status: 401 },
				);
			}

			const event = JSON.parse(body);
			await handleWebhookEvent(event);
		} else {
			const event = await req.json();
			await handleWebhookEvent(event);
		}

		return NextResponse.json({ received: true });
	} catch (err) {
		console.error("[POST /api/webhook]", err);
		return NextResponse.json({ error: "웹훅 처리 실패" }, { status: 500 });
	}
}

async function handleWebhookEvent(event: Record<string, unknown>) {
	const { type, data } = event as {
		type: string;
		data: { orderUid?: string; status?: string; trackingNumber?: string };
	};

	console.log("[Webhook]", type, data);

	if (!data?.orderUid) return;

	// 주문 상태 업데이트
	if (type === "order.status_changed" || type === "order.shipping_started") {
		await prisma.project.updateMany({
			where: { orderUid: data.orderUid },
			data: {
				orderStatus: normalizeOrderStatus(
					data.status,
					undefined,
					data.trackingNumber,
				) as unknown as string,
				trackingInfo: data.trackingNumber || undefined,
			},
		});
	}
}
