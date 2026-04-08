export type StoryModel = "gpt-4o-mini" | "gpt-4.1-mini";
export type ImageModel = "dall-e-2" | "gpt-image-1";
export type StoryKind = "COMIC" | "NOVEL";

export const DEFAULT_STORY_MODEL: StoryModel = "gpt-4o-mini";
export const DEFAULT_IMAGE_MODEL: ImageModel = "gpt-image-1";
export const DEFAULT_USD_TO_KRW = 1350;

export const STORY_MODEL_OPTIONS: Array<{ value: StoryModel; label: string }> =
	[
		{ value: "gpt-4o-mini", label: "gpt-4o-mini (가성비)" },
		{ value: "gpt-4.1-mini", label: "gpt-4.1-mini (품질 우선)" },
	];

export const IMAGE_MODEL_OPTIONS: Array<{ value: ImageModel; label: string }> =
	[
		{ value: "dall-e-2", label: "dall-e-2 (가성비)" },
		{ value: "gpt-image-1", label: "gpt-image-1 (품질 우선)" },
	];

const STORY_PRICING_PER_1M_TOKENS: Record<
	StoryModel,
	{ inputUsd: number; outputUsd: number }
> = {
	"gpt-4o-mini": { inputUsd: 0.15, outputUsd: 0.6 },
	"gpt-4.1-mini": { inputUsd: 0.4, outputUsd: 1.6 },
};

const IMAGE_PRICING_PER_IMAGE_USD: Record<ImageModel, number> = {
	"dall-e-2": 0.02,
	"gpt-image-1": 0.04,
};

export { IMAGE_PRICING_PER_IMAGE_USD };

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

function estimateStoryTokens(pageCount: number) {
	const safeCount = Math.max(4, Math.min(120, pageCount || 12));
	const inputTokens = 1400 + safeCount * 150;
	const outputTokens = 1800 + safeCount * 260;
	return { inputTokens, outputTokens };
}

export function isStoryModel(value: unknown): value is StoryModel {
	return value === "gpt-4o-mini" || value === "gpt-4.1-mini";
}

export function isImageModel(value: unknown): value is ImageModel {
	return value === "dall-e-2" || value === "gpt-image-1";
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
}): OpenAICostEstimate {
	const safeCount = Math.max(4, Math.min(120, input.pageCount || 12));
	const { inputTokens, outputTokens } = estimateStoryTokens(safeCount);
	const storyPricing = STORY_PRICING_PER_1M_TOKENS[input.storyModel];
	const storyUsd =
		(inputTokens / 1_000_000) * storyPricing.inputUsd +
		(outputTokens / 1_000_000) * storyPricing.outputUsd;

	const selectedImageModel = input.imageModel || DEFAULT_IMAGE_MODEL;
	const imageCount = input.kind === "COMIC" ? safeCount + 1 : 0;
	const imageUsd =
		imageCount > 0
			? imageCount * IMAGE_PRICING_PER_IMAGE_USD[selectedImageModel]
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
		totalUsd: Number((storyUsd + imageUsd).toFixed(4)),
	};
}
