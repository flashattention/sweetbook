import { estimateOpenAICost, usdToCredits } from "../lib/ai-pricing";

const cases = [
	{
		kind: "NOVEL" as const,
		pageCount: 24,
		storyModel: "gpt-4o-mini" as const,
		label: "NOVEL 24p gpt-4o-mini",
	},
	{
		kind: "NOVEL" as const,
		pageCount: 24,
		storyModel: "gpt-4.1" as const,
		label: "NOVEL 24p gpt-4.1",
	},
	{
		kind: "NOVEL" as const,
		pageCount: 120,
		storyModel: "gpt-4o-mini" as const,
		label: "NOVEL 120p gpt-4o-mini",
	},
	{
		kind: "COMIC" as const,
		pageCount: 24,
		storyModel: "gpt-4o-mini" as const,
		imageModel: "gpt-image-1" as const,
		label: "COMIC 24p + gpt-image-1",
	},
	{
		kind: "COMIC" as const,
		pageCount: 24,
		storyModel: "gpt-4o-mini" as const,
		imageModel: "dall-e-3" as const,
		label: "COMIC 24p + dall-e-3",
	},
	{
		kind: "COMIC" as const,
		pageCount: 24,
		storyModel: "gpt-4o-mini" as const,
		imageModel: "gpt-image-1" as const,
		refImageCount: 2,
		label: "COMIC 24p + gpt-image-1 + 2 ref images",
	},
];

for (const c of cases) {
	const est = estimateOpenAICost(c);
	const credits = usdToCredits(est.totalUsd);
	console.log(c.label + ":");
	console.log(
		"  story in/out tokens :",
		est.storyInputTokens,
		"/",
		est.storyOutputTokens,
	);
	console.log("  story USD           :", est.storyUsd.toFixed(4));
	console.log(
		"  image USD           :",
		est.imageUsd.toFixed(4),
		`(${est.imageCount}장)`,
	);
	console.log("  total USD           :", est.totalUsd.toFixed(4));
	console.log("  credits (×1.3)      :", credits);
	console.log();
}
