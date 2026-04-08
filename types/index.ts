export interface Project {
	id: string;
	title: string;
	coupleNameA: string;
	coupleNameB: string;
	anniversaryDate: string;
	bookSpecUid: string;
	coverTemplateUid: string | null;
	contentTemplateUid: string | null;
	coverImageUrl: string | null;
	coverCaption: string | null;
	bookUid: string | null;
	orderUid: string | null;
	orderStatus: string | null;
	trackingInfo: string | null;
	status: "DRAFT" | "PUBLISHED" | "ORDERED";
	pages: Page[];
	createdAt: string;
	updatedAt: string;
}

export interface Page {
	id: string;
	projectId: string;
	pageOrder: number;
	imageUrl: string;
	caption: string;
	createdAt: string;
	updatedAt: string;
}

export interface SweetbookTemplate {
	templateUid: string;
	name: string;
	category?: string;
	thumbnailUrl?: string;
}

export interface SweetbookBookSpec {
	bookSpecUid: string;
	name: string;
	description?: string;
	width?: number;
	height?: number;
}

export interface OrderEstimate {
	items: Array<{ bookUid: string; quantity: number; unitPrice: number }>;
	totalPrice: number;
	currency: string;
}

export interface ShippingInfo {
	recipientName: string;
	recipientPhone: string;
	postalCode: string;
	address1: string;
	address2: string;
	shippingMemo?: string;
}

export interface PublishResult {
	success: boolean;
	bookUid?: string;
	error?: string;
}

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}
