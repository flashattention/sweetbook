export type AppOrderStatus =
	| "PENDING"
	| "PROCESSING"
	| "SHIPPING"
	| "DELIVERED";

export function normalizeOrderStatus(
	status: unknown,
	statusDisplay?: unknown,
	trackingNumber?: unknown,
	fallback: AppOrderStatus = "PENDING",
): AppOrderStatus {
	const statusText = typeof status === "string" ? status.toUpperCase() : "";
	const displayText =
		typeof statusDisplay === "string" ? statusDisplay.toUpperCase() : "";
	const hasTracking =
		typeof trackingNumber === "string" && trackingNumber.trim().length > 0;

	if (statusText === "DELIVERED" || displayText.includes("배송완료")) {
		return "DELIVERED";
	}

	if (
		statusText === "SHIPPING" ||
		displayText.includes("배송중") ||
		displayText.includes("발송") ||
		hasTracking
	) {
		return "SHIPPING";
	}

	if (
		statusText === "PROCESSING" ||
		displayText.includes("결제완료") ||
		displayText.includes("제작") ||
		displayText.includes("인쇄")
	) {
		return "PROCESSING";
	}

	if (statusText === "PENDING" || displayText.includes("접수")) {
		return "PENDING";
	}

	return fallback;
}
