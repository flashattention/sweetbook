import { NextResponse } from "next/server";
import { DEFAULT_USD_TO_KRW } from "@/lib/ai-pricing";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const response = await fetch("https://open.er-api.com/v6/latest/USD", {
			cache: "no-store",
		});

		if (!response.ok) {
			throw new Error(`환율 API 응답 오류: ${response.status}`);
		}

		const payload = (await response.json()) as {
			result?: string;
			time_last_update_utc?: string;
			rates?: Record<string, number>;
		};

		const rate = payload.rates?.KRW;
		if (!rate || Number.isNaN(rate)) {
			throw new Error("KRW 환율 값을 찾지 못했습니다.");
		}

		return NextResponse.json({
			success: true,
			data: {
				base: "USD",
				target: "KRW",
				rate,
				provider: "open.er-api.com",
				updatedAt: payload.time_last_update_utc || null,
				fallback: false,
			},
		});
	} catch (error) {
		console.error("[GET /api/exchange-rate]", error);
		return NextResponse.json({
			success: true,
			data: {
				base: "USD",
				target: "KRW",
				rate: DEFAULT_USD_TO_KRW,
				provider: "fallback",
				updatedAt: null,
				fallback: true,
			},
		});
	}
}
