import { NextResponse } from "next/server";
import { isSweetbookConfigured } from "@/lib/sweetbook-api";

export const dynamic = "force-dynamic";

// GET /api/book-specs
export async function GET(request: Request) {
	if (!isSweetbookConfigured()) {
		return NextResponse.json({
			success: false,
			error: "SWEETBOOK_API_KEY가 설정되지 않았습니다.",
			data: [],
		});
	}

	try {
		const env =
			process.env.SWEETBOOK_ENV === "sandbox" ? "sandbox" : "live";
		const baseUrl =
			env === "sandbox"
				? "https://api-sandbox.sweetbook.com/v1"
				: "https://api.sweetbook.com/v1";

		const { searchParams } = new URL(request.url);
		const qs = searchParams.toString();
		const res = await fetch(`${baseUrl}/book-specs${qs ? `?${qs}` : ""}`, {
			headers: {
				Authorization: `Bearer ${process.env.SWEETBOOK_API_KEY}`,
			},
			cache: "no-store",
		});
		const raw = (await res.json()) as {
			success?: boolean;
			data?: unknown;
			message?: string;
			errors?: string[];
		};
		if (!res.ok) {
			return NextResponse.json(
				{ success: false, error: raw?.message || "판형 조회 실패" },
				{ status: res.status },
			);
		}
		if (raw.success === false) {
			return NextResponse.json(
				{
					success: false,
					error:
						raw.errors?.join(", ") ||
						raw.message ||
						"판형 조회 실패",
				},
				{ status: 502 },
			);
		}

		return NextResponse.json({ success: true, data: raw.data ?? raw });
	} catch (err) {
		console.error("[GET /api/book-specs]", err);
		return NextResponse.json(
			{
				success: false,
				error: err instanceof Error ? err.message : "판형 조회 실패",
			},
			{ status: 500 },
		);
	}
}
