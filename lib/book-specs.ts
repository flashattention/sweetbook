export interface SupportedBookSpec {
	bookSpecUid: string;
	name: string;
	pageMin: number;
	pageMax: number;
	pageIncrement: number;
	sandboxPriceBase: number;
	sandboxPricePerIncrement: number;
}

export const SUPPORTED_PHOTOBOOK_SPECS: SupportedBookSpec[] = [
	{
		bookSpecUid: "SQUAREBOOK_HC",
		name: "고화질 스퀘어북 (하드커버)",
		pageMin: 24,
		pageMax: 130,
		pageIncrement: 2,
		sandboxPriceBase: 100,
		sandboxPricePerIncrement: 10,
	},
	{
		bookSpecUid: "PHOTOBOOK_A4_SC",
		name: "A4 소프트커버 포토북",
		pageMin: 24,
		pageMax: 130,
		pageIncrement: 2,
		sandboxPriceBase: 100,
		sandboxPricePerIncrement: 10,
	},
	{
		bookSpecUid: "PHOTOBOOK_A5_SC",
		name: "A5 소프트커버 포토북",
		pageMin: 50,
		pageMax: 200,
		pageIncrement: 2,
		sandboxPriceBase: 100,
		sandboxPricePerIncrement: 10,
	},
];

export const DEFAULT_PHOTOBOOK_SPEC_UID = "SQUAREBOOK_HC";

export function getSupportedBookSpec(bookSpecUid?: string): SupportedBookSpec {
	return (
		SUPPORTED_PHOTOBOOK_SPECS.find(
			(spec) => spec.bookSpecUid === bookSpecUid,
		) || SUPPORTED_PHOTOBOOK_SPECS[0]
	);
}

export function getMinPagesByBookSpec(bookSpecUid?: string): number {
	return getSupportedBookSpec(bookSpecUid).pageMin;
}

export function normalizePrintablePageCount(params: {
	bookSpecUid?: string;
	requestedPageCount: number;
}): number {
	const spec = getSupportedBookSpec(params.bookSpecUid);
	const bounded = Math.min(
		spec.pageMax,
		Math.max(spec.pageMin, params.requestedPageCount || spec.pageMin),
	);
	const remainder = (bounded - spec.pageMin) % spec.pageIncrement;
	return remainder === 0
		? bounded
		: bounded + (spec.pageIncrement - remainder);
}

export interface BookProductionCostEstimate {
	bookSpecUid: string;
	bookSpecName: string;
	requestedPageCount: number;
	printablePageCount: number;
	estimatedPrice: number;
	basePrice: number;
	incrementPrice: number;
	incrementCount: number;
}

export function estimateBookProductionCost(params: {
	bookSpecUid?: string;
	requestedPageCount: number;
}): BookProductionCostEstimate {
	const spec = getSupportedBookSpec(params.bookSpecUid);
	const printablePageCount = normalizePrintablePageCount({
		bookSpecUid: spec.bookSpecUid,
		requestedPageCount: params.requestedPageCount,
	});
	const incrementCount = Math.max(
		0,
		(printablePageCount - spec.pageMin) / spec.pageIncrement,
	);
	const estimatedPrice =
		spec.sandboxPriceBase + incrementCount * spec.sandboxPricePerIncrement;

	return {
		bookSpecUid: spec.bookSpecUid,
		bookSpecName: spec.name,
		requestedPageCount: params.requestedPageCount,
		printablePageCount,
		estimatedPrice,
		basePrice: spec.sandboxPriceBase,
		incrementPrice: spec.sandboxPricePerIncrement,
		incrementCount,
	};
}
