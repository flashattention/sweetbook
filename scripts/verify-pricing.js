// @ts-nocheck
const STORY_PRICING = {
	"gpt-4o-mini": { inputUsd: 0.15, outputUsd: 0.6 },
	"gpt-4.1-mini": { inputUsd: 0.4, outputUsd: 1.6 },
	"gpt-4o": { inputUsd: 2.5, outputUsd: 10.0 },
	"gpt-4.1": { inputUsd: 2.0, outputUsd: 8.0 },
};
const IMAGE_USD = {
	"dall-e-2": 0.02,
	"dall-e-3": 0.04,
	"dall-e-3-hd": 0.08,
	"gpt-image-1": 0.042,
	"gpt-image-1-hd": 0.167,
};
const MARKUP = 1.3;
const RATE = 1350;

function tokens(pages, kind) {
	const n = Math.max(4, Math.min(120, pages));
	if (kind === "NOVEL") {
		const SR = 0.7;
		const oIn = 500,
			oOut = 500 + 50 * n;
		const mIn = 3300,
			mOut = 1200;
		const sIn = mIn + 1200,
			sOut = 1200;
		return {
			i: oIn + n * mIn + Math.round(n * SR * sIn),
			o: oOut + n * mOut + Math.round(n * SR * sOut),
		};
	}
	return { i: 600, o: 800 + n * 200 };
}

const cases = [
	{
		kind: "NOVEL",
		pages: 24,
		sm: "gpt-4o-mini",
		im: null,
		label: "NOVEL 24p  gpt-4o-mini",
	},
	{
		kind: "NOVEL",
		pages: 24,
		sm: "gpt-4.1",
		im: null,
		label: "NOVEL 24p  gpt-4.1",
	},
	{
		kind: "NOVEL",
		pages: 120,
		sm: "gpt-4o-mini",
		im: null,
		label: "NOVEL 120p gpt-4o-mini",
	},
	{
		kind: "COMIC",
		pages: 24,
		sm: "gpt-4o-mini",
		im: "gpt-image-1",
		label: "COMIC 24p  gpt-image-1",
	},
	{
		kind: "COMIC",
		pages: 24,
		sm: "gpt-4o-mini",
		im: "dall-e-3",
		label: "COMIC 24p  dall-e-3",
	},
	{
		kind: "COMIC",
		pages: 120,
		sm: "gpt-4o-mini",
		im: "gpt-image-1",
		label: "COMIC 120p gpt-image-1",
	},
];

for (const c of cases) {
	const { i, o } = tokens(c.pages, c.kind);
	const p = STORY_PRICING[c.sm];
	const storyUsd = (i / 1e6) * p.inputUsd + (o / 1e6) * p.outputUsd;
	const imgCount = c.im ? (c.kind === "COMIC" ? c.pages + 1 : 1) : 0;
	const imgUsd = imgCount > 0 ? imgCount * IMAGE_USD[c.im] : 0;
	const total = storyUsd + imgUsd;
	const credits = Math.ceil(total * RATE * MARKUP);
	console.log(c.label);
	console.log("  tokens in/out:", i, "/", o);
	console.log(
		"  story USD:",
		storyUsd.toFixed(4),
		"  image USD:",
		imgUsd.toFixed(2),
		"(" + imgCount + "img)",
	);
	console.log("  TOTAL USD:", total.toFixed(4), "  credits (x1.3):", credits);
	console.log();
}
