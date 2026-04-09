export interface Project {
	id: string;
	userId?: string | null;
	title: string;
	storyCharacters?: string | null;
	requestedPageCount?: number | null;
	generationStage?: string | null;
	generationProgress?: number | null;
	generationError?: string | null;
	generationCostUsd?: number | null;
	projectType: "PHOTOBOOK" | "COMIC" | "NOVEL";
	genre?: string | null;
	synopsis?: string | null;
	comicStyle?: "MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK" | null;
	bookSpecUid: string;
	coverTemplateUid: string | null;
	contentTemplateUid: string | null;
	coverTemplateOverrides?: {
		parameters?: Record<string, unknown>;
		fileUrls?: Record<string, string | string[]>;
	} | null;
	contentTemplateOverrides?: {
		parameters?: Record<string, unknown>;
		fileUrls?: Record<string, string | string[]>;
	} | null;
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
	contentTemplateUid?: string | null;
	contentTemplateOverrides?: {
		parameters?: Record<string, unknown>;
		fileUrls?: Record<string, string | string[]>;
	} | null;
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
