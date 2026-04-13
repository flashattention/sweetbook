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
		// ── 실제 생성 플로우 (ai-generator.ts 기준) ──
		//
		// [1] 아웃라인 호출 (1회, callJsonObject)
		//   입력: 프롬프트 약 500 토큰
		//   출력: tagline + synopsis + characterProfiles + chapters
		//         + pageBlueprints(페이지별 beat/emotion/keyDetail)
		//         ≈ 500 + 50 × pageCount 토큰
		//
		// [2] 페이지별 본문 호출 (pageCount 회, callJsonObject)
		//   입력 구성:
		//     - 시스템 지시 + 제목/장르 + 규칙:  약 400 토큰
		//     - synopsis:                       약 150 토큰
		//     - characterProfiles:              약 150 토큰
		//     - chapter hint + blueprint:       약  60 토큰
		//     - 직전 2페이지 캡션 평균
		//       (페이지 1-2: 0토큰, 페이지 3+: 각 ~1,200토큰 × 2)
		//       24페이지 평균 ≈ (2×0 + 22×2,400) / 24 ≈ 2,200 토큰
		//   → 평균 입력 ≈ 400+150+150+60+2,200 = 2,960 → 보수적으로 3,300
		//   출력: 한국어 1,000자 JSON ≈ 1,200 토큰 (Korean ≈ 1.2 token/char)
		//
		// [3] strengthen 보강 호출 (약 70% 페이지, isNovelPageLengthPreferred 실패 시)
		//   입력: 본문 호출 그대로 + 초안 캡션 ~ 1,200 토큰 추가 ≈ 4,500 토큰
		//   출력: ≈ 1,200 토큰

		const STRENGTHEN_RATE = 0.7;

		const outlineInput = 500;
		const outlineOutput = 500 + 50 * safeCount;

		const mainCallInput = 3300;
		const mainCallOutput = 1200;

		const strengthenInput = mainCallInput + 1200; // 4,500
		const strengthenOutput = 1200;

		const inputTokens =
			outlineInput +
			safeCount * mainCallInput +
			Math.round(safeCount * STRENGTHEN_RATE * strengthenInput);

		const outputTokens =
			outlineOutput +
			safeCount * mainCallOutput +
			Math.round(safeCount * STRENGTHEN_RATE * strengthenOutput);

		return { inputTokens, outputTokens };
	}

	// ── COMIC: callJsonObject 단 1회 호출 ──
	//
	// 입력: 고정 프롬프트(제목/등장인물/장르/요청/지시문 + 캐릭터 일관성 지침)
	//        ≈ 600 토큰 (페이지 수와 무관)
	//
	// 출력: JSON 전체 (tagline + synopsis + characterProfiles + chapters
	//        + pages 배열 각 pageOrder/caption/imagePrompt/dialogues/shotDirection)
	//       오버헤드 ≈ 800, 페이지당 ≈ 200 토큰
	const inputTokens = 600;
	const outputTokens = 800 + safeCount * 200;
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
