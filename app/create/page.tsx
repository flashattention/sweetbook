"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	convertUsdToKrw,
	DEFAULT_USD_TO_KRW,
	DEFAULT_STORY_MODEL,
	DEFAULT_IMAGE_MODEL,
	IMAGE_MODEL_OPTIONS,
	STORY_MODEL_OPTIONS,
	estimateOpenAICost,
	imageModelSupportsReferenceInput,
	usdToCredits,
	type ImageModel,
	type StoryModel,
} from "@/lib/ai-pricing";
import {
	DEFAULT_PHOTOBOOK_SPEC_UID,
	SUPPORTED_PHOTOBOOK_SPECS,
	estimateBookProductionCost,
	getSupportedBookSpec,
} from "@/lib/book-specs";
import {
	buildTemplateOverrides,
	type TemplateRequiredInput,
} from "@/lib/template-overrides";

interface CreateTemplateItem {
	templateUid: string;
	templateName: string;
	templateKind: string;
	bookSpecUid: string;
	requiredInputs?: TemplateRequiredInput[];
	publishSupport?: {
		supported: boolean;
		reason?: string;
		unsupportedBindings?: string[];
	};
	theme?: string | null;
	thumbnails?: {
		layout?: string;
	} | null;
}

interface BookSpecApiItem {
	bookSpecUid?: string;
	name?: string;
	[key: string]: unknown;
}

const TEMPLATE_CACHE_KEY = "sweetbook:create:templates:v1";
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000;
const BOOK_SPEC_PREVIEW_FALLBACK: Record<string, string> = {
	SQUAREBOOK_HC: "/book-specs/squarebook-hc.svg",
	PHOTOBOOK_A4_SC: "/book-specs/photobook-a4-sc.svg",
	PHOTOBOOK_A5_SC: "/book-specs/photobook-a5-sc.svg",
};

function pickImageUrlFromUnknown(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (
			trimmed.startsWith("https://") ||
			trimmed.startsWith("http://") ||
			trimmed.startsWith("/")
		) {
			return trimmed;
		}
	}

	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		for (const nested of [
			obj.url,
			obj.src,
			obj.imageUrl,
			obj.thumbnailUrl,
			obj.previewUrl,
		]) {
			const parsed = pickImageUrlFromUnknown(nested);
			if (parsed) {
				return parsed;
			}
		}
	}

	return undefined;
}

function getBookSpecPreviewFromApi(spec: BookSpecApiItem): string | undefined {
	for (const candidate of [
		spec.thumbnailUrl,
		spec.thumbnail,
		spec.previewUrl,
		spec.previewImageUrl,
		spec.mockupImageUrl,
		spec.coverImageUrl,
		spec.imageUrl,
		spec.image,
		spec.photoUrl,
		spec.media,
		spec.images,
	]) {
		const imageUrl = pickImageUrlFromUnknown(candidate);
		if (imageUrl) {
			return imageUrl;
		}
	}

	return undefined;
}

function formatBookSpecRatio(widthMm: number, heightMm: number): string {
	if (widthMm <= 0 || heightMm <= 0) {
		return "-";
	}
	const ratio = (heightMm / widthMm).toFixed(3);
	return `1:${ratio}`;
}

function isDisallowedStoryCoverTemplate(template: CreateTemplateItem): boolean {
	const search = `${template.templateName || ""} ${template.theme || ""}`
		.toLowerCase()
		.trim();
	return (
		search.includes("알림장") ||
		search.includes("diary") ||
		search.includes("notice")
	);
}

function normalizeTemplateSearchText(...values: Array<unknown>): string {
	return values
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function hasTemplateKeyword(source: string, keywords: string[]): boolean {
	return keywords.some((keyword) => source.includes(keyword));
}

function isDiaryThemeBTemplate(template: CreateTemplateItem): boolean {
	const search = normalizeTemplateSearchText(
		template.templateName,
		template.theme,
		template.templateUid,
	);
	return hasTemplateKeyword(search, [
		"일기장 b",
		"일기장b",
		"diary b",
		"diaryb",
	]);
}

function isStoryCoverAutoFilledField(field: TemplateRequiredInput): boolean {
	const search =
		`${field.name || ""} ${field.label || ""} ${field.binding || ""}`
			.toLowerCase()
			.replace(/[^a-z0-9가-힣]+/g, " ");

	return (
		search.includes("coverphoto") ||
		search.includes("cover photo") ||
		search.includes("frontphoto") ||
		search.includes("front photo") ||
		search.includes("date range") ||
		search.includes("daterange")
	);
}

function isStoryCoverTitleAutoField(field: TemplateRequiredInput): boolean {
	const key = normalizeParameterKey(field.name || "");
	return (
		key === "title" ||
		key === "booktitle" ||
		key === "subtitle" ||
		key === "spinetitle"
	);
}

function isComicAllowedContentTemplate(template: CreateTemplateItem): boolean {
	const search = normalizeTemplateSearchText(
		template.templateName,
		template.theme,
		template.templateUid,
	);
	return (
		hasTemplateKeyword(search, [
			"내지 gallery",
			"내지gallery",
			"gallery",
		]) && isDiaryThemeBTemplate(template)
	);
}

function isNovelAllowedContentTemplate(template: CreateTemplateItem): boolean {
	const search = normalizeTemplateSearchText(
		template.templateName,
		template.theme,
		template.templateUid,
	);
	return (
		hasTemplateKeyword(search, [
			"내지 b",
			"내지b",
			"content b",
			"contentb",
		]) &&
		!hasTemplateKeyword(search, ["gallery"]) &&
		isDiaryThemeBTemplate(template)
	);
}

function isStoryContentDateAutoEmptyField(
	field: TemplateRequiredInput,
): boolean {
	const search = normalizeTemplateSearchText(
		field.name,
		field.label,
		field.binding,
	);
	const tokens = search.split(" ").filter(Boolean);
	return (
		tokens.includes("date") ||
		tokens.includes("daterange") ||
		tokens.includes("startdate") ||
		tokens.includes("enddate")
	);
}

function normalizeParameterKey(name: string): string {
	return normalizeTemplateSearchText(name).replace(/\s+/g, "");
}

function isNovelContentAutoField(field: TemplateRequiredInput): boolean {
	const key = normalizeParameterKey(field.name || "");
	return key === "title" || key === "booktitle" || key === "diarytext";
}

function buildStoryContentAutoInputValues(
	fields: TemplateRequiredInput[],
	mode: "COMIC" | "NOVEL",
): Record<string, string> {
	const values: Record<string, string> = {};
	for (const field of fields) {
		if (isStoryContentDateAutoEmptyField(field)) {
			values[field.name] = "";
			continue;
		}

		if (mode === "NOVEL" && isNovelContentAutoField(field)) {
			values[field.name] = "";
		}
	}
	return values;
}

export default function CreatePage() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [mode, setMode] = useState<"PHOTOBOOK" | "COMIC" | "NOVEL">(
		"PHOTOBOOK",
	);
	const [comicStyle, setComicStyle] = useState<
		"MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK"
	>("MANGA");
	const [bookSpecUid, setBookSpecUid] = useState(DEFAULT_PHOTOBOOK_SPEC_UID);
	const [pageCount, setPageCount] = useState(24);
	const [storyModel, setStoryModel] =
		useState<StoryModel>(DEFAULT_STORY_MODEL);
	const [imageModel, setImageModel] =
		useState<ImageModel>(DEFAULT_IMAGE_MODEL);
	const [characterImages, setCharacterImages] = useState<
		Array<{ name: string; imageUrl: string; uploading?: boolean }>
	>([]);
	const [usdToKrwRate, setUsdToKrwRate] = useState(DEFAULT_USD_TO_KRW);
	const [userCredits, setUserCredits] = useState<number | null>(null);
	const [exchangeRateMeta, setExchangeRateMeta] = useState<{
		provider: string;
		updatedAt: string | null;
		fallback: boolean;
	}>({
		provider: "fallback",
		updatedAt: null,
		fallback: true,
	});

	const [templates, setTemplates] = useState<CreateTemplateItem[]>([]);
	const [templatesLoading, setTemplatesLoading] = useState(true);
	const [templateLoadError, setTemplateLoadError] = useState("");
	const [coverTemplateUid, setCoverTemplateUid] = useState("");
	const [contentTemplateUid, setContentTemplateUid] = useState("");
	const [coverTemplateInputValues, setCoverTemplateInputValues] = useState<
		Record<string, Record<string, string>>
	>({});
	const [contentTemplateInputValues, setContentTemplateInputValues] =
		useState<Record<string, Record<string, string>>>({});
	const [bookSpecPreviewUrls, setBookSpecPreviewUrls] = useState<
		Record<string, string>
	>({});

	const costEstimate =
		mode === "PHOTOBOOK"
			? null
			: estimateOpenAICost({
					kind: mode === "COMIC" ? "COMIC" : "NOVEL",
					pageCount,
					storyModel,
					imageModel,
					refImageCount:
						mode === "COMIC" ? characterImages.length : 0,
				});
	const selectedPhotobookSpec = getSupportedBookSpec(bookSpecUid);
	const photobookProductionEstimate = estimateBookProductionCost({
		bookSpecUid,
		requestedPageCount: selectedPhotobookSpec.pageMin,
	});
	const creativeBookProductionEstimate = estimateBookProductionCost({
		bookSpecUid,
		requestedPageCount: pageCount,
	});
	const apiCostKrw = costEstimate
		? convertUsdToKrw(costEstimate.totalUsd, usdToKrwRate)
		: 0;
	const requiredCredits = costEstimate
		? usdToCredits(costEstimate.totalUsd, usdToKrwRate)
		: 0;
	const hasEnoughCredits =
		userCredits === null || userCredits >= requiredCredits;
	const combinedCreativeCostKrw =
		creativeBookProductionEstimate.estimatedPrice + apiCostKrw;
	const allCoverTemplates = templates.filter(
		(template) =>
			template.bookSpecUid === bookSpecUid &&
			String(template.templateKind).toLowerCase() === "cover",
	);
	const coverTemplates =
		mode === "PHOTOBOOK"
			? allCoverTemplates
			: allCoverTemplates.filter(
					(template) => !isDisallowedStoryCoverTemplate(template),
				);
	const allContentTemplates = templates.filter(
		(template) =>
			template.bookSpecUid === bookSpecUid &&
			String(template.templateKind).toLowerCase() === "content",
	);
	const contentTemplates =
		mode === "COMIC"
			? allContentTemplates.filter((template) =>
					isComicAllowedContentTemplate(template),
				)
			: mode === "NOVEL"
				? allContentTemplates.filter((template) =>
						isNovelAllowedContentTemplate(template),
					)
				: allContentTemplates;
	const selectedCoverTemplate =
		coverTemplates.find(
			(template) => template.templateUid === coverTemplateUid,
		) || null;
	const selectedContentTemplate =
		contentTemplates.find(
			(template) => template.templateUid === contentTemplateUid,
		) || null;
	const selectedCoverRequiredInputsRaw =
		selectedCoverTemplate?.requiredInputs || [];
	const selectedCoverRequiredInputs =
		mode === "PHOTOBOOK"
			? selectedCoverRequiredInputsRaw
			: mode === "COMIC" || mode === "NOVEL"
				? selectedCoverRequiredInputsRaw.filter(
						(field) =>
							!isStoryCoverAutoFilledField(field) &&
							!isStoryCoverTitleAutoField(field),
					)
				: selectedCoverRequiredInputsRaw.filter(
						(field) => !isStoryCoverAutoFilledField(field),
					);
	const selectedContentRequiredInputsRaw =
		selectedContentTemplate?.requiredInputs || [];
	const selectedCoverInputValues =
		coverTemplateInputValues[coverTemplateUid] || {};

	useEffect(() => {
		let active = true;

		async function loadExchangeRate() {
			try {
				const response = await fetch("/api/exchange-rate", {
					cache: "no-store",
				});
				if (!response.ok) {
					throw new Error(`환율 조회 실패: ${response.status}`);
				}

				const json = (await response.json()) as {
					success: boolean;
					data?: {
						rate?: number;
						provider?: string;
						updatedAt?: string | null;
						fallback?: boolean;
					};
				};

				if (!active || !json.data?.rate) {
					return;
				}

				setUsdToKrwRate(json.data.rate);
				setExchangeRateMeta({
					provider: json.data.provider || "unknown",
					updatedAt: json.data.updatedAt || null,
					fallback: Boolean(json.data.fallback),
				});
			} catch (exchangeError) {
				console.error(
					"[CreatePage] exchange rate fetch failed",
					exchangeError,
				);
			}
		}

		void loadExchangeRate();

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		fetch("/api/credits")
			.then((r) => r.json())
			.then((d) => {
				if (d.success && d.data) setUserCredits(d.data.credits);
			})
			.catch(() => {});
	}, []);

	useEffect(() => {
		let active = true;

		async function loadBookSpecPreviewUrls() {
			try {
				const response = await fetch("/api/book-specs", {
					cache: "no-store",
				});
				if (!response.ok || !active) {
					return;
				}

				const json = (await response.json()) as {
					success?: boolean;
					data?: unknown;
				};
				const rawData = json.data;
				const list = Array.isArray(rawData)
					? (rawData as BookSpecApiItem[])
					: Array.isArray(
								(rawData as { bookSpecs?: unknown })?.bookSpecs,
						  )
						? (((rawData as { bookSpecs?: unknown }).bookSpecs ||
								[]) as BookSpecApiItem[])
						: [];

				const nextPreviewUrls: Record<string, string> = {};
				for (const spec of list) {
					if (!spec.bookSpecUid) {
						continue;
					}
					const imageUrl = getBookSpecPreviewFromApi(spec);
					if (imageUrl) {
						nextPreviewUrls[spec.bookSpecUid] = imageUrl;
					}
				}

				setBookSpecPreviewUrls(nextPreviewUrls);
			} catch {
				// Ignore preview loading failures and keep fallback images.
			}
		}

		void loadBookSpecPreviewUrls();

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let active = true;

		async function loadTemplates() {
			try {
				const cachedRaw = localStorage.getItem(TEMPLATE_CACHE_KEY);
				if (cachedRaw) {
					const cached = JSON.parse(cachedRaw) as {
						expiresAt?: number;
						templates?: CreateTemplateItem[];
					};
					if (
						typeof cached.expiresAt === "number" &&
						cached.expiresAt > Date.now() &&
						Array.isArray(cached.templates)
					) {
						if (active) {
							setTemplates(cached.templates);
							setTemplatesLoading(false);
							setTemplateLoadError("");
						}
						return;
					}
				}

				setTemplatesLoading(true);
				setTemplateLoadError("");
				const pageSize = 100;
				let offset = 0;
				let hasNext = true;
				const allTemplates: CreateTemplateItem[] = [];

				while (hasNext) {
					const response = await fetch(
						`/api/templates?limit=${pageSize}&offset=${offset}&compatibility=publish`,
					);
					const json = (await response.json()) as {
						success: boolean;
						error?: string;
						data?: {
							templates?: CreateTemplateItem[];
							pagination?: {
								hasNext?: boolean;
							};
						};
					};

					if (!response.ok || !json.success) {
						throw new Error(
							json.error || "템플릿 목록을 불러오지 못했습니다.",
						);
					}

					allTemplates.push(...(json.data?.templates || []));
					hasNext = json.data?.pagination?.hasNext === true;
					offset += pageSize;

					if (offset > 5000) {
						break;
					}
				}

				if (!active) {
					return;
				}

				setTemplates(allTemplates);
				try {
					localStorage.setItem(
						TEMPLATE_CACHE_KEY,
						JSON.stringify({
							expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS,
							templates: allTemplates,
						}),
					);
				} catch {
					// Ignore storage errors and continue.
				}
			} catch (loadError) {
				console.error("[CreatePage] templates fetch failed", loadError);
				if (!active) {
					return;
				}
				setTemplateLoadError(
					loadError instanceof Error
						? loadError.message
						: "템플릿 목록을 불러오지 못했습니다.",
				);
			} finally {
				if (active) {
					setTemplatesLoading(false);
				}
			}
		}

		void loadTemplates();

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (mode === "COMIC" && bookSpecUid !== "SQUAREBOOK_HC") {
			setBookSpecUid("SQUAREBOOK_HC");
		}
	}, [mode, bookSpecUid]);

	useEffect(() => {
		if (
			coverTemplates.length > 0 &&
			!coverTemplates.some(
				(template) => template.templateUid === coverTemplateUid,
			)
		) {
			setCoverTemplateUid(coverTemplates[0].templateUid);
		}
		if (coverTemplates.length === 0) {
			setCoverTemplateUid("");
		}
	}, [bookSpecUid, coverTemplateUid, coverTemplates]);

	useEffect(() => {
		if (
			contentTemplates.length > 0 &&
			!contentTemplates.some(
				(template) => template.templateUid === contentTemplateUid,
			)
		) {
			setContentTemplateUid(contentTemplates[0].templateUid);
		}
		if (contentTemplates.length === 0) {
			setContentTemplateUid("");
		}
	}, [bookSpecUid, contentTemplateUid, contentTemplates]);

	async function handleCharacterImageUpload(
		index: number,
		file: File,
	): Promise<void> {
		if (file.size > 5 * 1024 * 1024) {
			alert("이미지 파일은 5MB 이하만 업로드 가능합니다.");
			return;
		}
		setCharacterImages((prev) =>
			prev.map((item, i) =>
				i === index ? { ...item, uploading: true } : item,
			),
		);
		try {
			const formData = new FormData();
			formData.append("file", file);
			const res = await fetch("/api/upload/ref", {
				method: "POST",
				body: formData,
			});
			const json = (await res.json()) as {
				success?: boolean;
				url?: string;
				error?: string;
			};
			if (!res.ok || !json.success || !json.url) {
				throw new Error(json.error || "업로드 실패");
			}
			setCharacterImages((prev) =>
				prev.map((item, i) =>
					i === index
						? { ...item, imageUrl: json.url!, uploading: false }
						: item,
				),
			);
		} catch (err) {
			setCharacterImages((prev) =>
				prev.map((item, i) =>
					i === index ? { ...item, uploading: false } : item,
				),
			);
			alert(
				err instanceof Error
					? err.message
					: "이미지 업로드에 실패했습니다.",
			);
		}
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError("");

		if (
			mode !== "PHOTOBOOK" &&
			(!coverTemplateUid || !contentTemplateUid)
		) {
			setError("표지와 내지 템플릿을 각각 선택해 주세요.");
			setLoading(false);
			return;
		}

		const missingCoverField = selectedCoverRequiredInputs.find((field) => {
			const value = selectedCoverInputValues[field.name];
			return !value || value.trim() === "";
		});
		if (mode !== "PHOTOBOOK" && missingCoverField) {
			setError(
				`표지 템플릿 추가 입력값을 확인해 주세요: ${missingCoverField.label || missingCoverField.name}`,
			);
			setLoading(false);
			return;
		}

		const form = e.currentTarget;
		const title = (form.elements.namedItem("title") as HTMLInputElement)
			.value;

		const data =
			mode === "PHOTOBOOK"
				? {
						projectType: "PHOTOBOOK",
						title,
						bookSpecUid,
						coverTemplateUid: undefined,
						contentTemplateUid: undefined,
						coverTemplateOverrides: undefined,
						contentTemplateOverrides: undefined,
					}
				: {
						projectType: mode,
						title,
						bookSpecUid,
						coverTemplateUid,
						contentTemplateUid,
						coverTemplateOverrides: buildTemplateOverrides({
							fields: selectedCoverRequiredInputs,
							values: selectedCoverInputValues,
						}),
						contentTemplateOverrides: undefined,
						genre: (
							form.elements.namedItem("genre") as HTMLInputElement
						).value,
						characters: (
							form.elements.namedItem(
								"characters",
							) as HTMLInputElement
						).value,
						description: (
							form.elements.namedItem(
								"description",
							) as HTMLTextAreaElement
						).value,
						pageCount: Number(
							(
								form.elements.namedItem(
									"pageCount",
								) as HTMLInputElement
							).value,
						),
						comicStyle: mode === "COMIC" ? comicStyle : undefined,
						storyModel,
						imageModel: mode === "COMIC" ? imageModel : undefined,
						characterImages:
							mode === "COMIC" &&
							imageModelSupportsReferenceInput(imageModel) &&
							characterImages.length > 0
								? characterImages.map(({ name, imageUrl }) => ({
										name,
										imageUrl,
									}))
								: undefined,
					};

		try {
			const res = await fetch("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "프로젝트 생성 실패");

			if (mode === "PHOTOBOOK") {
				router.push(`/editor/${json.data.id}`);
			} else {
				const query = new URLSearchParams({
					storyModel,
					imageModel: mode === "COMIC" ? imageModel : "",
				});
				router.push(
					`/create/progress/${json.data.id}?${query.toString()}`,
				);
			}
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "오류가 발생했습니다.",
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
			<div className="w-full max-w-2xl">
				{/* 헤더 */}
				<div className="text-center mb-8">
					<Link
						href="/"
						className="text-violet-400 text-sm hover:underline"
					>
						← 홈으로
					</Link>
					<h1 className="text-3xl font-bold text-white mt-4 mb-2">
						새 프로젝트 만들기
					</h1>
					<p className="text-zinc-500 text-sm">
						포토북, 만화책, 소설 중 하나를 선택해 시작하세요.
					</p>
				</div>

				<div className="bg-zinc-900 rounded-2xl border border-white/[0.08] p-2 mb-4 grid grid-cols-3 gap-2">
					{[
						{ key: "PHOTOBOOK", label: "포토북" },
						{ key: "COMIC", label: "만화책" },
						{ key: "NOVEL", label: "소설" },
					].map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() =>
								setMode(
									item.key as "PHOTOBOOK" | "COMIC" | "NOVEL",
								)
							}
							className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
								mode === item.key
									? "bg-violet-600 text-white"
									: "text-zinc-300 hover:bg-white/[0.04]"
							}`}
						>
							{item.label}
						</button>
					))}
				</div>

				{/* 폼 */}
				<form
					onSubmit={handleSubmit}
					className="bg-zinc-900 rounded-2xl border border-white/[0.08] p-8 space-y-5"
				>
					{/* 공통 입력 */}
					<div>
						<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
							제목 <span className="text-violet-400">*</span>
						</label>
						<input
							name="title"
							type="text"
							required
							placeholder={
								mode === "PHOTOBOOK"
									? "예: 우리의 첫 번째 이야기"
									: "예: 여름의 끝, 소년의 시작"
							}
							className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
						/>
					</div>

					{mode === "PHOTOBOOK" ? (
						<>
							<p className="text-sm text-zinc-400 bg-zinc-800 border border-white/[0.06] rounded-lg px-4 py-3">
								가족, 졸업, 여행 등 어떤 주제든 자유롭게
								포토북을 만들 수 있어요.
							</p>

							<div>
								<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
									포토북 판형{" "}
									<span className="text-violet-400">*</span>
								</label>
								<BookSpecPicker
									selectedBookSpecUid={bookSpecUid}
									onChange={setBookSpecUid}
									previewUrls={bookSpecPreviewUrls}
								/>
								<div className="rounded-xl border border-white/[0.06] bg-zinc-800 px-4 py-3 text-sm text-zinc-300 mt-3">
									<p className="font-semibold text-white mb-1">
										{selectedPhotobookSpec.name}
									</p>
									<p className="mt-1">
										내지 기준 크기:{" "}
										{selectedPhotobookSpec.trimWidthMm}x{" "}
										{selectedPhotobookSpec.trimHeightMm} mm
										(비율{" "}
										{formatBookSpecRatio(
											selectedPhotobookSpec.trimWidthMm,
											selectedPhotobookSpec.trimHeightMm,
										)}
										)
									</p>
									<p className="mt-1">
										최소 {selectedPhotobookSpec.pageMin}
										페이지, 최대{" "}
										{
											selectedPhotobookSpec.pageMax
										}페이지,{" "}
										{selectedPhotobookSpec.pageIncrement}
										페이지 단위로 제작됩니다.
									</p>
									<p className="mt-1">
										기본 비용: ₩
										{selectedPhotobookSpec.sandboxPriceBase.toLocaleString(
											"ko-KR",
										)}{" "}
										(기본 {selectedPhotobookSpec.pageMin}
										페이지 포함)
									</p>
									<p className="mt-1">
										{selectedPhotobookSpec.pageMin}
										페이지 넘어가는{" "}
										{selectedPhotobookSpec.pageIncrement}
										페이지당 추가 비용: ₩
										{selectedPhotobookSpec.sandboxPricePerIncrement.toLocaleString(
											"ko-KR",
										)}{" "}
										(페이지당 약 ₩
										{(
											selectedPhotobookSpec.sandboxPricePerIncrement /
											selectedPhotobookSpec.pageIncrement
										).toLocaleString("ko-KR")}
										)
									</p>
								</div>
								<div className="rounded-xl border border-emerald-800/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300 mt-3">
									<p className="text-xl font-extrabold mb-2 leading-tight">
										예상 비용
									</p>
									<p>
										책 제작비: ₩
										{photobookProductionEstimate.estimatedPrice.toLocaleString(
											"ko-KR",
										)}{" "}
										(출력용{" "}
										{
											photobookProductionEstimate.printablePageCount
										}
										페이지 기준)
									</p>
									<p className="text-xl font-extrabold mt-2 leading-tight">
										총 예상 제작비: ₩
										{photobookProductionEstimate.estimatedPrice.toLocaleString(
											"ko-KR",
										)}
									</p>
									<p className="text-xs text-emerald-400 mt-1">
										Sandbox 단가 기준 추정치이며, 실제
										페이지 구성 후 금액은 달라질 수
										있습니다.
									</p>
								</div>
							</div>

							<div className="rounded-xl border border-dashed border-white/[0.1] bg-zinc-800/50 px-4 py-4 text-sm text-zinc-400">
								포토북 생성 후 제작 페이지에서 표지 템플릿과
								페이지별 내지 템플릿을 설정합니다.
							</div>
						</>
					) : (
						<>
							<div className="grid md:grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
										장르{" "}
										<span className="text-violet-400">
											*
										</span>
									</label>
									<input
										name="genre"
										type="text"
										required
										placeholder="예: 로맨스, 성장, 판타지"
										className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
									/>
								</div>
								<div>
									<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
										페이지 수{" "}
										<span className="text-violet-400">
											*
										</span>
									</label>
									<input
										name="pageCount"
										type="number"
										required
										value={pageCount}
										onChange={(e) =>
											setPageCount(
												Math.max(
													selectedPhotobookSpec.pageMin,
													Math.min(
														120,
														Number(
															e.target.value,
														) ||
															selectedPhotobookSpec.pageMin,
													),
												),
											)
										}
										min={selectedPhotobookSpec.pageMin}
										max={120}
										className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
									/>
								</div>
							</div>

							<div className="space-y-3">
								<div>
									<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
										책 판형
									</label>
									<BookSpecPicker
										selectedBookSpecUid={bookSpecUid}
										onChange={setBookSpecUid}
										previewUrls={bookSpecPreviewUrls}
										allowedBookSpecUids={
											mode === "COMIC"
												? ["SQUAREBOOK_HC"]
												: undefined
										}
										disabled={mode === "COMIC"}
									/>
									{mode === "COMIC" && (
										<p className="text-xs text-indigo-600 mt-1.5">
											만화책은 고화질 스퀘어북 판형만
											지원합니다.
										</p>
									)}
									<p className="text-xs text-zinc-500 mt-1.5">
										선택한 판형 기준으로 출력용 페이지와
										제작비를 함께 계산합니다.
									</p>
									<div className="rounded-xl border border-white/[0.06] bg-zinc-800 px-4 py-3 text-sm text-zinc-300 mt-3">
										<p className="font-semibold text-white mb-1">
											{selectedPhotobookSpec.name}
										</p>
										<p className="mt-1">
											내지 기준 크기:{" "}
											{selectedPhotobookSpec.trimWidthMm}x{" "}
											{selectedPhotobookSpec.trimHeightMm}{" "}
											mm (비율{" "}
											{formatBookSpecRatio(
												selectedPhotobookSpec.trimWidthMm,
												selectedPhotobookSpec.trimHeightMm,
											)}
											)
										</p>
										<p className="mt-1">
											최소 {selectedPhotobookSpec.pageMin}
											페이지, 최대{" "}
											{selectedPhotobookSpec.pageMax}
											페이지,
											{
												selectedPhotobookSpec.pageIncrement
											}
											페이지 단위로 제작됩니다.
										</p>
										<p className="mt-1">
											기본 비용: ₩
											{selectedPhotobookSpec.sandboxPriceBase.toLocaleString(
												"ko-KR",
											)}{" "}
											(기본{" "}
											{selectedPhotobookSpec.pageMin}
											페이지 포함)
										</p>
										<p className="mt-1">
											{selectedPhotobookSpec.pageMin}
											페이지 넘어가는{" "}
											{
												selectedPhotobookSpec.pageIncrement
											}
											페이지당 추가 비용: ₩
											{selectedPhotobookSpec.sandboxPricePerIncrement.toLocaleString(
												"ko-KR",
											)}{" "}
											(페이지당 약 ₩
											{(
												selectedPhotobookSpec.sandboxPricePerIncrement /
												selectedPhotobookSpec.pageIncrement
											).toLocaleString("ko-KR")}
											)
										</p>
									</div>
								</div>

								<div className="grid md:grid-cols-2 gap-3">
									<div>
										<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
											줄거리 생성 모델
										</label>
										<select
											value={storyModel}
											onChange={(e) =>
												setStoryModel(
													e.target
														.value as StoryModel,
												)
											}
											className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
										>
											{STORY_MODEL_OPTIONS.map(
												(option) => (
													<option
														key={option.value}
														value={option.value}
													>
														{option.label}
													</option>
												),
											)}
										</select>
									</div>

									{mode === "COMIC" && (
										<div>
											<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
												만화 이미지 생성 모델
											</label>
											<select
												value={imageModel}
												onChange={(e) =>
													setImageModel(
														e.target
															.value as ImageModel,
													)
												}
												className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
											>
												{IMAGE_MODEL_OPTIONS.map(
													(option) => (
														<option
															key={option.value}
															value={option.value}
														>
															{option.label}
														</option>
													),
												)}
											</select>
										</div>
									)}
								</div>

								{/* 캐릭터 참조 이미지 (gpt-image-1 이상 모델에서만) */}
								{mode === "COMIC" &&
									imageModelSupportsReferenceInput(
										imageModel,
									) && (
										<div className="mt-4 border border-violet-100 rounded-xl p-4 bg-violet-50/50">
											<div className="flex items-center justify-between mb-3">
												<div>
													<h4 className="text-sm font-semibold text-violet-700">
														캐릭터 참조 이미지{" "}
														<span className="font-normal text-violet-500">
															(선택)
														</span>
													</h4>
													<p className="text-xs text-violet-500 mt-0.5">
														각 캐릭터의 이름과
														사진을 등록하면 AI가
														외모를 일관성 있게
														그립니다.
													</p>
												</div>
												{characterImages.length < 5 && (
													<button
														type="button"
														onClick={() =>
															setCharacterImages(
																(prev) => [
																	...prev,
																	{
																		name: "",
																		imageUrl:
																			"",
																	},
																],
															)
														}
														className="text-xs bg-violet-500 text-white rounded-lg px-3 py-1.5 hover:bg-violet-600 transition-colors"
													>
														+ 캐릭터 추가
													</button>
												)}
											</div>
											{characterImages.length === 0 && (
												<p className="text-xs text-violet-400 text-center py-2">
													캐릭터 이미지를 추가하면
													일관된 캐릭터 표현이
													가능합니다.
												</p>
											)}
											<div className="space-y-2">
												{characterImages.map(
													(char, idx) => (
														<div
															key={idx}
															className="flex items-center gap-2 bg-zinc-800 rounded-lg border border-violet-800/30 p-2"
														>
															{char.imageUrl ? (
																// eslint-disable-next-line @next/next/no-img-element
																<img
																	src={
																		char.imageUrl
																	}
																	alt={
																		char.name ||
																		"캐릭터"
																	}
																	className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
																/>
															) : (
																<label
																	className={`w-10 h-10 flex items-center justify-center rounded-lg border-2 border-dashed ${char.uploading ? "border-violet-300 bg-violet-50" : "border-violet-200 hover:border-violet-400 cursor-pointer"} flex-shrink-0 transition-colors`}
																>
																	<input
																		type="file"
																		accept="image/jpeg,image/png,image/webp"
																		className="hidden"
																		disabled={
																			char.uploading
																		}
																		onChange={(
																			e,
																		) => {
																			const file =
																				e
																					.target
																					.files?.[0];
																			if (
																				file
																			) {
																				void handleCharacterImageUpload(
																					idx,
																					file,
																				);
																			}
																		}}
																	/>
																	{char.uploading ? (
																		<svg
																			className="animate-spin w-4 h-4 text-violet-400"
																			fill="none"
																			viewBox="0 0 24 24"
																		>
																			<circle
																				className="opacity-25"
																				cx="12"
																				cy="12"
																				r="10"
																				stroke="currentColor"
																				strokeWidth="4"
																			/>
																			<path
																				className="opacity-75"
																				fill="currentColor"
																				d="M4 12a8 8 0 018-8v8z"
																			/>
																		</svg>
																	) : (
																		<span className="text-violet-300 text-lg">
																			+
																		</span>
																	)}
																</label>
															)}
															<input
																type="text"
																value={
																	char.name
																}
																onChange={(
																	e,
																) => {
																	const v =
																		e.target
																			.value;
																	setCharacterImages(
																		(
																			prev,
																		) =>
																			prev.map(
																				(
																					item,
																					i,
																				) =>
																					i ===
																					idx
																						? {
																								...item,
																								name: v,
																							}
																						: item,
																			),
																	);
																}}
																placeholder="캐릭터 이름"
																className="flex-1 bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
															/>
															{char.imageUrl && (
																<label
																	className="text-xs text-violet-400 cursor-pointer hover:text-violet-600 flex-shrink-0"
																	title="이미지 변경"
																>
																	<input
																		type="file"
																		accept="image/jpeg,image/png,image/webp"
																		className="hidden"
																		onChange={(
																			e,
																		) => {
																			const file =
																				e
																					.target
																					.files?.[0];
																			if (
																				file
																			) {
																				void handleCharacterImageUpload(
																					idx,
																					file,
																				);
																			}
																		}}
																	/>
																	변경
																</label>
															)}
															<button
																type="button"
																onClick={() =>
																	setCharacterImages(
																		(
																			prev,
																		) =>
																			prev.filter(
																				(
																					_,
																					i,
																				) =>
																					i !==
																					idx,
																			),
																	)
																}
																className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
															>
																✕
															</button>
														</div>
													),
												)}
											</div>
										</div>
									)}
							</div>

							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div>
										<h3 className="text-sm font-semibold text-zinc-300">
											출판 템플릿 선택
										</h3>
										<p className="text-xs text-zinc-500 mt-1">
											AI로 내용을 만든 뒤 Sweetbook으로
											보낼 표지와 내지 템플릿을
											선택합니다.
										</p>
									</div>
									{templatesLoading && (
										<span className="text-xs text-zinc-500">
											템플릿 불러오는 중...
										</span>
									)}
								</div>

								{templateLoadError && (
									<div className="rounded-lg border border-amber-800/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
										{templateLoadError}
									</div>
								)}

								<TemplatePicker
									title="표지 템플릿"
									loading={templatesLoading}
									templates={coverTemplates}
									selectedTemplateUid={coverTemplateUid}
									onSelect={setCoverTemplateUid}
									emptyMessage="선택한 판형에 자동 발행 가능한 표지 템플릿이 없습니다."
								/>
								<TemplateRequiredInputForm
									title="표지 템플릿 추가 입력"
									fields={selectedCoverRequiredInputs}
									values={selectedCoverInputValues}
									onChange={(fieldName, value) =>
										setCoverTemplateInputValues((prev) => ({
											...prev,
											[coverTemplateUid]: {
												...(prev[coverTemplateUid] ||
													{}),
												[fieldName]: value,
											},
										}))
									}
								/>
								<TemplatePicker
									title="내지 템플릿"
									loading={templatesLoading}
									templates={contentTemplates}
									selectedTemplateUid={contentTemplateUid}
									onSelect={setContentTemplateUid}
									emptyMessage="선택한 판형에 자동 발행 가능한 내지 템플릿이 없습니다."
								/>
								<p className="text-xs text-zinc-500 mt-1">
									{mode === "NOVEL"
										? "소설 내지는 추가 입력 없이, 각 페이지의 AI 본문과 페이지 이미지 1장이 템플릿에 자동 연결됩니다. title/date는 자동 처리됩니다."
										: "만화 내지는 추가 입력 없이, 각 페이지의 AI 장면 이미지 1장이 템플릿에 자동 연결됩니다. collagePhotos 같은 다중 이미지 필드도 현재 페이지 이미지 1장을 배열로 넣어 자동 처리합니다."}
								</p>
							</div>

							{mode === "COMIC" && (
								<div>
									<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
										만화 스타일
									</label>
									<select
										value={comicStyle}
										onChange={(e) =>
											setComicStyle(
												e.target.value as
													| "MANGA"
													| "CARTOON"
													| "AMERICAN"
													| "PICTURE_BOOK",
											)
										}
										className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
									>
										<option value="MANGA">
											일본 만화책 스타일
										</option>
										<option value="CARTOON">
											카툰 스타일
										</option>
										<option value="AMERICAN">
											미국 코믹북 스타일
										</option>
										<option value="PICTURE_BOOK">
											그림책 스타일
										</option>
									</select>
								</div>
							)}

							<div>
								<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
									등장인물(쉼표 구분){" "}
									<span className="text-violet-400">*</span>
								</label>
								<input
									name="characters"
									type="text"
									required
									placeholder="예: 민지, 준호, 담임 선생님"
									className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
								/>
							</div>

							<div>
								<label className="block text-sm font-semibold text-zinc-300 mb-1.5">
									줄거리/설명{" "}
									<span className="text-violet-400">*</span>
								</label>
								<textarea
									name="description"
									required
									rows={4}
									placeholder="예: 한국에서 자란 소년이 좌절과 성장을 거쳐 자신의 길을 찾는 이야기"
									className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
								/>
							</div>

							{costEstimate && (
								<div className="rounded-xl border border-emerald-800/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
									<p className="text-xl font-extrabold mb-2 leading-tight">
										예상 비용
									</p>
									<p>
										OpenAI 줄거리: $
										{costEstimate.storyUsd.toFixed(4)} (입력{" "}
										{costEstimate.storyInputTokens} / 출력{" "}
										{costEstimate.storyOutputTokens} 토큰
										추정)
									</p>
									{mode === "COMIC" && (
										<p>
											OpenAI 이미지: $
											{costEstimate.imageUsd.toFixed(4)} (
											{costEstimate.imageCount}장)
										</p>
									)}
									<p>
										API 비용 합계: $
										{costEstimate.totalUsd.toFixed(4)}
										(약 ₩
										{apiCostKrw.toLocaleString("ko-KR")})
									</p>
									<p>
										책 제작비: ₩
										{creativeBookProductionEstimate.estimatedPrice.toLocaleString(
											"ko-KR",
										)}{" "}
										(출력용{" "}
										{
											creativeBookProductionEstimate.printablePageCount
										}
										페이지 기준)
									</p>
									<p className="text-xl font-extrabold mt-2 leading-tight">
										총 예상 제작비: ₩
										{combinedCreativeCostKrw.toLocaleString(
											"ko-KR",
										)}
									</p>
									<p className="text-xs text-emerald-400 mt-1">
										실제 API 청구액은 프롬프트 길이와 모델
										정책에 따라 달라지고, 책 제작비는 선택
										판형의 샌드박스 단가 기준 추정치입니다.
										합산 금액은 $1 = ₩
										{usdToKrwRate.toLocaleString("ko-KR")}{" "}
										기준 환산입니다.
									</p>
									<p className="text-xs text-emerald-400 mt-1">
										환율 출처: {exchangeRateMeta.provider}
										{exchangeRateMeta.updatedAt
											? ` · ${exchangeRateMeta.updatedAt}`
											: ""}
										{exchangeRateMeta.fallback
											? " · 실시간 환율 조회 실패로 기본값 사용"
											: ""}
									</p>
								</div>
							)}
						</>
					)}

					{/* 에러 */}
					{error && (
						<div className="bg-red-900/20 border border-red-800/30 text-red-400 text-sm px-4 py-3 rounded-lg">
							{error}
						</div>
					)}

					{/* 크레딧 표시 (AI 생성 모드) */}
					{mode !== "PHOTOBOOK" && (
						<div
							className={`flex items-center justify-between text-sm px-4 py-3 rounded-lg border ${
								hasEnoughCredits
									? "bg-zinc-800/60 border-white/[0.07] text-zinc-300"
									: "bg-red-900/20 border-red-800/30 text-red-300"
							}`}
						>
							<span>
								필요 크레딧:{" "}
								<strong className="text-white">
									{requiredCredits.toLocaleString()} C
								</strong>
							</span>
							<span>
								보유:{" "}
								{userCredits === null ? (
									<span className="text-zinc-500">
										확인 중...
									</span>
								) : (
									<strong
										className={
											hasEnoughCredits
												? "text-violet-300"
												: "text-red-400"
										}
									>
										{userCredits.toLocaleString()} C
									</strong>
								)}
							</span>
						</div>
					)}
					{mode !== "PHOTOBOOK" && !hasEnoughCredits && (
						<p className="text-xs text-red-400 text-center">
							크레딧이 부족합니다.{" "}
							<a
								href="/profile"
								className="underline hover:text-red-300"
							>
								마이페이지
							</a>
							에서 충전해주세요.
						</p>
					)}

					{/* 제출 */}
					<button
						type="submit"
						disabled={
							loading ||
							(mode !== "PHOTOBOOK" && !hasEnoughCredits)
						}
						className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors duration-200"
					>
						{loading
							? "생성 중..."
							: mode === "PHOTOBOOK"
								? "포토북 만들기 시작 →"
								: `${mode === "COMIC" ? "만화책" : "소설"} 자동 생성하기 →`}
					</button>
				</form>

				<p className="text-center text-zinc-500 text-xs mt-6">
					{mode === "PHOTOBOOK"
						? "생성 후 에디터에서 사진과 문구를 추가할 수 있어요."
						: "생성 후 AI가 구성한 페이지를 즉시 확인할 수 있어요."}
				</p>
			</div>
		</div>
	);
}

function TemplatePicker(props: {
	title: string;
	loading: boolean;
	templates: CreateTemplateItem[];
	selectedTemplateUid: string;
	onSelect: (templateUid: string) => void;
	emptyMessage: string;
}) {
	if (props.loading) {
		return (
			<div>
				<div className="flex items-center justify-between mb-2">
					<h3 className="text-sm font-semibold text-zinc-300">
						{props.title}
					</h3>
					<p className="text-xs text-zinc-500">불러오는 중...</p>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
					{Array.from({ length: 3 }).map((_, idx) => (
						<div
							key={`${props.title}-skeleton-${idx}`}
							className="rounded-2xl border border-white/[0.08] bg-zinc-900 overflow-hidden"
						>
							<div className="aspect-[4/3] bg-zinc-700 animate-pulse" />
							<div className="p-3 space-y-2">
								<div className="h-3 bg-zinc-700 rounded w-full" />
								<div className="h-3 bg-zinc-700 rounded w-2/3" />
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (props.templates.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-white/[0.1] bg-zinc-800/50 px-4 py-6 text-sm text-zinc-400">
				{props.emptyMessage}
			</div>
		);
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-2">
				<h3 className="text-sm font-semibold text-zinc-300">
					{props.title}
				</h3>
				<p className="text-xs text-zinc-500">
					{props.templates.length}개 템플릿
				</p>
			</div>
			<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
				{props.templates.map((template) => {
					const selected =
						template.templateUid === props.selectedTemplateUid;

					return (
						<button
							key={template.templateUid}
							type="button"
							onClick={() => props.onSelect(template.templateUid)}
							className={`text-left rounded-2xl border overflow-hidden transition-all ${
								selected
									? "border-violet-500 ring-2 ring-violet-500/30 bg-violet-900/20"
									: "border-white/[0.08] bg-zinc-900 hover:border-violet-500 hover:bg-zinc-800"
							}`}
						>
							<div className="bg-zinc-800 border-b border-white/[0.06] overflow-hidden">
								{template.thumbnails?.layout ? (
									<img
										src={template.thumbnails.layout}
										alt={template.templateName}
										className="block w-full h-auto object-contain"
									/>
								) : (
									<div className="w-full min-h-40 flex items-center justify-center text-xs text-zinc-500 bg-zinc-800">
										미리보기 없음
									</div>
								)}
							</div>
							<div className="p-3">
								<p className="font-semibold text-sm text-zinc-200 line-clamp-2">
									{template.templateName}
								</p>
								<p className="text-xs text-zinc-500 mt-1">
									UID: {template.templateUid}
								</p>
								{template.theme && (
									<p className="text-xs text-violet-400 mt-1">
										테마: {template.theme}
									</p>
								)}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function BookSpecPicker(props: {
	selectedBookSpecUid: string;
	onChange: (bookSpecUid: string) => void;
	previewUrls: Record<string, string>;
	allowedBookSpecUids?: string[];
	disabled?: boolean;
}) {
	const specs = props.allowedBookSpecUids
		? SUPPORTED_PHOTOBOOK_SPECS.filter((spec) =>
				props.allowedBookSpecUids?.includes(spec.bookSpecUid),
			)
		: SUPPORTED_PHOTOBOOK_SPECS;

	return (
		<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
			{specs.map((spec) => {
				const selected = spec.bookSpecUid === props.selectedBookSpecUid;
				const imageUrl =
					props.previewUrls[spec.bookSpecUid] ||
					BOOK_SPEC_PREVIEW_FALLBACK[spec.bookSpecUid];

				return (
					<button
						key={spec.bookSpecUid}
						type="button"
						onClick={() => {
							if (!props.disabled) {
								props.onChange(spec.bookSpecUid);
							}
						}}
						className={`rounded-xl border text-left overflow-hidden transition-all ${
							selected
								? "border-violet-500 ring-2 ring-violet-500/30 bg-violet-900/20"
								: "border-white/[0.08] bg-zinc-900 hover:border-violet-500"
						}`}
						disabled={props.disabled}
					>
						<div className="aspect-[4/3] bg-zinc-800 overflow-hidden">
							{imageUrl ? (
								<img
									src={imageUrl}
									alt={spec.name}
									className="w-full h-full object-cover"
								/>
							) : (
								<div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">
									미리보기 없음
								</div>
							)}
						</div>
						<div className="px-3 py-2">
							<p className="text-xs font-semibold text-zinc-200 line-clamp-2">
								{spec.name}
							</p>
							<p className="text-[11px] text-zinc-500 mt-1">
								{spec.trimWidthMm} x {spec.trimHeightMm} mm
							</p>
							<p className="text-[11px] text-zinc-500">
								비율{" "}
								{formatBookSpecRatio(
									spec.trimWidthMm,
									spec.trimHeightMm,
								)}
							</p>
						</div>
					</button>
				);
			})}
		</div>
	);
}

function TemplateRequiredInputForm(props: {
	title: string;
	fields: TemplateRequiredInput[];
	values: Record<string, string>;
	onChange: (fieldName: string, value: string) => void;
}) {
	if (props.fields.length === 0) {
		return null;
	}

	return (
		<div className="rounded-xl border border-white/[0.08] bg-zinc-800 px-4 py-4 space-y-3">
			<p className="text-sm font-semibold text-zinc-200">{props.title}</p>
			{props.fields.map((field) => {
				const binding = String(field.binding || "").toLowerCase();
				const type = field.type || "string";
				const placeholder =
					binding === "file"
						? "파일 URL 입력 (여러 개는 콤마로 구분)"
						: `값 입력 (${type})`;

				return (
					<div key={field.name}>
						<label className="block text-xs font-semibold text-zinc-300 mb-1">
							{field.label || field.name}
							<span className="text-violet-400 ml-1">*</span>
						</label>
						<input
							type="text"
							value={props.values[field.name] || ""}
							onChange={(event) =>
								props.onChange(field.name, event.target.value)
							}
							placeholder={placeholder}
							className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
						/>
						<p className="text-[11px] text-zinc-500 mt-1">
							필드명: {field.name} · 바인딩:{" "}
							{field.binding || "unknown"}· 타입: {type}
						</p>
						{field.description && (
							<p className="text-[11px] text-zinc-500 mt-0.5">
								{field.description}
							</p>
						)}
					</div>
				);
			})}
		</div>
	);
}
