export type StoryModel = "gpt-4o-mini" | "gpt-4.1-mini" | "gpt-4o" | "gpt-4.1";
export type ImageModel =
	| "dall-e-2"
	| "dall-e-3"
	| "dall-e-3-hd"
	| "gpt-image-1"
	| "gpt-image-1-hd";
export type StoryKind = "COMIC" | "NOVEL";

export const DEFAULT_STORY_MODEL: StoryModel = "gpt-4o-mini";
export const DEFAULT_IMAGE_MODEL: ImageModel = "gpt-image-1";
export const DEFAULT_USD_TO_KRW = 1350;

/** 1 크레딧 = 1 KRW 기준 */
export const CREDIT_MARKUP = 1.3;

/**
 * USD 비용을 크레딧으로 변환 (API 비용 × 1.3배)
 * 크레딧 단위는 KRW 기반: 1 credit = 1 KRW
 */
export function usdToCredits(
	usd: number,
	exchangeRate: number = DEFAULT_USD_TO_KRW,
): number {
	return Math.ceil(usd * exchangeRate * CREDIT_MARKUP);
}

export const STORY_MODEL_OPTIONS: Array<{
	value: StoryModel;
	label: string;
	badge?: string;
}> = [
	{ value: "gpt-4o-mini", label: "GPT-4o mini", badge: "가성비" },
	{ value: "gpt-4.1-mini", label: "GPT-4.1 mini", badge: "균형" },
	{ value: "gpt-4o", label: "GPT-4o", badge: "고품질" },
	{ value: "gpt-4.1", label: "GPT-4.1", badge: "최신 최고품질" },
];

export const IMAGE_MODEL_OPTIONS: Array<{
	value: ImageModel;
	label: string;
	badge?: string;
	supportsRefImages?: boolean;
}> = [
	{ value: "dall-e-2", label: "DALL-E 2", badge: "가성비" },
	{ value: "dall-e-3", label: "DALL-E 3", badge: "균형" },
	{ value: "dall-e-3-hd", label: "DALL-E 3 HD", badge: "고품질" },
	{
		value: "gpt-image-1",
		label: "GPT Image 1",
		badge: "최고품질",
		supportsRefImages: true,
	},
	{
		value: "gpt-image-1-hd",
		label: "GPT Image 1 HD",
		badge: "최고품질 HD",
		supportsRefImages: true,
	},
];

/** gpt-image-1 / gpt-image-1-hd는 캐릭터 참조 이미지(Responses API)를 지원 */
export function imageModelSupportsReferenceInput(model: ImageModel): boolean {
	return model === "gpt-image-1" || model === "gpt-image-1-hd";
}

const STORY_PRICING_PER_1M_TOKENS: Record<
	StoryModel,
	{ inputUsd: number; outputUsd: number }
> = {
	"gpt-4o-mini": { inputUsd: 0.15, outputUsd: 0.6 },
	"gpt-4.1-mini": { inputUsd: 0.4, outputUsd: 1.6 },
	"gpt-4o": { inputUsd: 2.5, outputUsd: 10.0 },
	"gpt-4.1": { inputUsd: 2.0, outputUsd: 8.0 },
};

/** 이미지 1장당 USD 비용 (1024×1024 기준) */
const IMAGE_PRICING_PER_IMAGE_USD: Record<ImageModel, number> = {
	"dall-e-2": 0.02,
	"dall-e-3": 0.04,
	"dall-e-3-hd": 0.08,
	"gpt-image-1": 0.042,
	"gpt-image-1-hd": 0.167,
};

export { IMAGE_PRICING_PER_IMAGE_USD };

/**
 * 캐릭터 참조 이미지 N장 사용 시 페이지당 추가 비용 (Responses API 사용)
 * gpt-4o로 이미지 레퍼런스를 처리하므로, 레퍼런스 이미지 토큰 비용이 추가됨.
 * 1024×1024 이미지 1장 ≈ 1445 input tokens @ gpt-4o $2.50/1M ≈ $0.0036
 */
export function estimateRefImageCostPerPanelUsd(refImageCount: number): number {
	if (refImageCount <= 0) return 0;
	const tokensPerRefImage = 1445;
	const gpt4oInputUsdPer1M = 2.5;
	return (refImageCount * tokensPerRefImage * gpt4oInputUsdPer1M) / 1_000_000;
}

export function calcStoryActualCostUsd(
	usage: { inputTokens: number; outputTokens: number },
	model: StoryModel,
): number {
	const pricing = STORY_PRICING_PER_1M_TOKENS[model];
	return (
		(usage.inputTokens / 1_000_000) * pricing.inputUsd +
		(usage.outputTokens / 1_000_000) * pricing.outputUsd
	);
}

function estimateStoryTokens(pageCount: number, kind: StoryKind) {
	const safeCount = Math.max(4, Math.min(120, pageCount || 12));
	if (kind === "NOVEL") {
		const inputTokens = 800 + safeCount * 1500;
		const outputTokens = 500 + safeCount * 700;
		return { inputTokens, outputTokens };
	}
	// COMIC
	const inputTokens = 1400 + safeCount * 150;
	const outputTokens = 1800 + safeCount * 260;
	return { inputTokens, outputTokens };
}

export function isStoryModel(value: unknown): value is StoryModel {
	return (
		value === "gpt-4o-mini" ||
		value === "gpt-4.1-mini" ||
		value === "gpt-4o" ||
		value === "gpt-4.1"
	);
}

export function isImageModel(value: unknown): value is ImageModel {
	return (
		value === "dall-e-2" ||
		value === "dall-e-3" ||
		value === "dall-e-3-hd" ||
		value === "gpt-image-1" ||
		value === "gpt-image-1-hd"
	);
}

export interface OpenAICostEstimate {
	storyModel: StoryModel;
	imageModel: ImageModel | null;
	pageCount: number;
	storyInputTokens: number;
	storyOutputTokens: number;
	storyUsd: number;
	imageCount: number;
	imageUsd: number;
	refImageExtraUsd: number;
	totalUsd: number;
}

export function convertUsdToKrw(
	usdAmount: number,
	exchangeRate: number = DEFAULT_USD_TO_KRW,
): number {
	return Math.round(usdAmount * exchangeRate);
}

export function estimateOpenAICost(input: {
	kind: StoryKind;
	pageCount: number;
	storyModel: StoryModel;
	imageModel?: ImageModel;
	refImageCount?: number;
}): OpenAICostEstimate {
	const safeCount = Math.max(4, Math.min(120, input.pageCount || 12));
	const { inputTokens, outputTokens } = estimateStoryTokens(
		safeCount,
		input.kind,
	);
	const storyPricing = STORY_PRICING_PER_1M_TOKENS[input.storyModel];
	const storyUsd =
		(inputTokens / 1_000_000) * storyPricing.inputUsd +
		(outputTokens / 1_000_000) * storyPricing.outputUsd;

	const selectedImageModel = input.imageModel || DEFAULT_IMAGE_MODEL;
	// COMIC: 페이지 수 + 표지 1장 / NOVEL: 표지 1장
	const imageCount = input.kind === "COMIC" ? safeCount + 1 : 1;
	const imageUsd =
		imageCount > 0
			? imageCount * IMAGE_PRICING_PER_IMAGE_USD[selectedImageModel]
			: 0;

	// 캐릭터 참조 이미지 사용 시 추가 비용 (COMIC만 해당)
	const refCount = input.refImageCount ?? 0;
	const refImageExtraUsd =
		input.kind === "COMIC" &&
		imageModelSupportsReferenceInput(selectedImageModel) &&
		refCount > 0
			? imageCount * estimateRefImageCostPerPanelUsd(refCount)
			: 0;

	return {
		storyModel: input.storyModel,
		imageModel: input.kind === "COMIC" ? selectedImageModel : null,
		pageCount: safeCount,
		storyInputTokens: inputTokens,
		storyOutputTokens: outputTokens,
		storyUsd: Number(storyUsd.toFixed(4)),
		imageCount,
		imageUsd: Number(imageUsd.toFixed(4)),
		refImageExtraUsd: Number(refImageExtraUsd.toFixed(4)),
		totalUsd: Number((storyUsd + imageUsd + refImageExtraUsd).toFixed(4)),
	};
}
