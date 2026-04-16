import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
	getSweetbookClient,
	isSweetbookConfigured,
	fetchImageBlob,
	postSweetbookTemplateForm,
	fetchSweetbookTemplateDetail,
	type SweetbookTemplateDetail,
	type SweetbookTemplateParameterDefinition,
} from "@/lib/sweetbook-api";
import {
	type TemplateKind,
	type TemplateProjectContext,
	type TemplatePageContext,
	type TemplateTextRuntimeContext,
	type TemplateOverrideValue,
	type TemplateUidTextRule,
	pickFirstString,
	TEMPLATE_UID_TEXT_OVERRIDES,
} from "@/lib/template-mappings";
import {
	DEFAULT_PHOTOBOOK_SPEC_UID,
	getMinPagesByBookSpec,
} from "@/lib/book-specs";
import {
	parseTemplateOverridesFromUnknown,
	mergeTemplateOverrides as mergeTemplateOverrideValues,
} from "@/lib/template-overrides";

interface PublishTemplateOverrides {
	parameters?: Record<string, unknown>;
	fileUrls?: Record<string, string | string[]>;
}

interface PublishRequestBody {
	coverOverrides?: PublishTemplateOverrides;
	contentOverrides?: PublishTemplateOverrides;
	contentPageOverrides?: Record<string, PublishTemplateOverrides>;
}

const TEMPLATE_FINGERPRINT_PARAM_KEY = "__sbTemplateFingerprint";

function sanitizeTemplateOverrides(
	value: unknown,
): PublishTemplateOverrides | undefined {
	if (!value) {
		return undefined;
	}

	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as Record<string, unknown>;
			return sanitizeTemplateOverrides(parsed);
		} catch {
			return undefined;
		}
	}

	if (typeof value !== "object") {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const parameters =
		raw.parameters && typeof raw.parameters === "object"
			? (() => {
					const source = raw.parameters as Record<string, unknown>;
					const sanitized = { ...source };
					delete sanitized[TEMPLATE_FINGERPRINT_PARAM_KEY];
					return sanitized;
				})()
			: undefined;
	const fileUrls =
		raw.fileUrls && typeof raw.fileUrls === "object"
			? (raw.fileUrls as Record<string, string | string[]>)
			: undefined;
	return { parameters, fileUrls };
}

function mergeTemplateOverrides(
	base: PublishTemplateOverrides | undefined,
	override: PublishTemplateOverrides | undefined,
): PublishTemplateOverrides | undefined {
	if (!base && !override) {
		return undefined;
	}

	const parameters = {
		...(base?.parameters || {}),
		...(override?.parameters || {}),
	};
	const fileUrls = {
		...(base?.fileUrls || {}),
		...(override?.fileUrls || {}),
	};

	if (
		Object.keys(parameters).length === 0 &&
		Object.keys(fileUrls).length === 0
	) {
		return undefined;
	}

	return { parameters, fileUrls };
}

function extractImageUrlCandidate(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || null;
	}

	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as Record<string, unknown>;
	const candidateKeys = ["url", "image", "photo", "src", "href", "fileUrl"];

	for (const key of candidateKeys) {
		const candidate = record[key];
		if (typeof candidate !== "string") {
			continue;
		}
		const trimmed = candidate.trim();
		if (trimmed) {
			return trimmed;
		}
	}

	return null;
}

function isLikelyFileUrlCandidate(value: string): boolean {
	const trimmed = String(value || "").trim();
	if (!trimmed) {
		return false;
	}

	// 실제 다운로드 가능한 URL/경로만 파일 업로드 대상으로 간주한다.
	if (/^https?:\/\//i.test(trimmed)) {
		return true;
	}
	if (trimmed.startsWith("/")) {
		return true;
	}

	return false;
}

function isLikelyServerFileNameCandidate(value: string): boolean {
	const trimmed = String(value || "").trim();
	if (!trimmed) {
		return false;
	}

	// 서버 파일명 토큰 허용 (예: b1, b2, line1, line1.png)
	// 공백/슬래시/한글 등 자유 텍스트는 제외한다.
	if (/[\s\/\\]/.test(trimmed)) {
		return false;
	}
	if (/[가-힣]/.test(trimmed)) {
		return false;
	}

	return /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(trimmed);
}

async function parsePublishRequestBody(
	req: NextRequest,
): Promise<PublishRequestBody> {
	try {
		const json = (await req.json()) as Record<string, unknown>;
		const coverOverrides = sanitizeTemplateOverrides(json.coverOverrides);
		const contentOverrides = sanitizeTemplateOverrides(
			json.contentOverrides,
		);
		const rawPageOverrides =
			json.contentPageOverrides &&
			typeof json.contentPageOverrides === "object"
				? (json.contentPageOverrides as Record<string, unknown>)
				: undefined;
		const contentPageOverrides: Record<string, PublishTemplateOverrides> =
			{};

		if (rawPageOverrides) {
			for (const [page, overrides] of Object.entries(rawPageOverrides)) {
				const sanitized = sanitizeTemplateOverrides(overrides);
				if (sanitized) {
					contentPageOverrides[page] = sanitized;
				}
			}
		}

		return {
			coverOverrides,
			contentOverrides,
			contentPageOverrides:
				Object.keys(contentPageOverrides).length > 0
					? contentPageOverrides
					: undefined,
		};
	} catch {
		return {};
	}
}

async function applyFileUrlOverrides(params: {
	baseFiles: Record<string, Blob | Blob[]>;
	fileUrls?: Record<string, string | string[]>;
	origin: string;
}): Promise<{
	files: Record<string, Blob | Blob[]>;
	parameterFileValues: Record<string, string | string[]>;
}> {
	const { baseFiles, fileUrls, origin } = params;
	if (!fileUrls) {
		return { files: baseFiles, parameterFileValues: {} };
	}

	const merged: Record<string, Blob | Blob[]> = { ...baseFiles };
	const parameterFileValues: Record<string, string | string[]> = {};
	const parseFileUrlList = (value: string | string[]): string[] => {
		if (Array.isArray(value)) {
			return value
				.map((item) => extractImageUrlCandidate(item))
				.filter((url): url is string => Boolean(url))
				.filter(Boolean);
		}

		if (typeof value !== "string") {
			return [];
		}

		const trimmed = value.trim();
		if (!trimmed) {
			return [];
		}

		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return parsed
						.map((item) => extractImageUrlCandidate(item))
						.filter((url): url is string => Boolean(url))
						.filter(Boolean);
				}
			} catch {
				// Fall through to comma-separated parsing.
			}
		}

		return trimmed
			.split(",")
			.map((url) => url.trim())
			.filter(Boolean);
	};

	for (const [fieldName, value] of Object.entries(fileUrls)) {
		const cleanedUrls = parseFileUrlList(value);

		if (cleanedUrls.length === 0) {
			continue;
		}

		const fetchableUrls = cleanedUrls.filter((url) =>
			isLikelyFileUrlCandidate(url),
		);
		const serverFileNames = cleanedUrls.filter((url) =>
			isLikelyServerFileNameCandidate(url),
		);

		const blobs: Blob[] = [];
		for (const imageUrl of fetchableUrls) {
			const blob = await fetchImageBlob(imageUrl, origin);
			blobs.push(blob);
		}

		if (blobs.length > 0) {
			merged[fieldName] = blobs.length === 1 ? blobs[0] : blobs;
			continue;
		}

		if (serverFileNames.length > 0) {
			parameterFileValues[fieldName] =
				serverFileNames.length === 1
					? serverFileNames[0]
					: serverFileNames;
		}
	}

	return { files: merged, parameterFileValues };
}

function isFileLikeBinding(binding: string | null | undefined): boolean {
	const normalized = String(binding || "").toLowerCase();
	return normalized === "file" || normalized.includes("gallery");
}

function parsePotentialFileUrls(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((item) => extractImageUrlCandidate(item))
			.filter((url): url is string => Boolean(url))
			.filter((url) => isLikelyFileUrlCandidate(url));
	}

	if (typeof value !== "string") {
		return [];
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return [];
	}

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed
					.map((item) => extractImageUrlCandidate(item))
					.filter((url): url is string => Boolean(url))
					.filter((url) => isLikelyFileUrlCandidate(url));
			}
		} catch {
			// Fall through to comma-separated parsing.
		}
	}

	return trimmed
		.split(",")
		.map((item) => item.trim())
		.filter((item) => isLikelyFileUrlCandidate(item));
}

function collectTemplateRequiredFields(detail: SweetbookTemplateDetail) {
	const definitions = detail.parameters?.definitions || {};
	return Object.entries(definitions)
		.filter(([, definition]) => Boolean(definition.required))
		.map(([name, definition]) => ({
			name,
			binding: definition.binding || null,
			type: definition.type || null,
			label: definition.label || null,
			description: definition.description || null,
		}));
}

function pickFirstNumber(...values: unknown[]): number | null {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
	}
	return null;
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

function isDisallowedStoryCoverTemplate(
	detail: SweetbookTemplateDetail,
): boolean {
	const search = normalizeTemplateSearchText(
		detail.templateName,
		detail.templateUid,
	);
	return (
		hasTemplateKeyword(search, ["알림장", "diary", "notice"]) ||
		hasTemplateKeyword(search, ["noticebook", "notification"])
	);
}

function isComicAllowedContentTemplate(
	detail: SweetbookTemplateDetail,
): boolean {
	const search = normalizeTemplateSearchText(
		detail.templateName,
		(detail as { theme?: string | null }).theme || null,
		detail.templateUid,
	);
	return (
		hasTemplateKeyword(search, [
			"내지 gallery",
			"내지gallery",
			"gallery",
		]) &&
		hasTemplateKeyword(search, ["일기장 b", "일기장b", "diary b", "diaryb"])
	);
}

function isNovelAllowedContentTemplate(
	detail: SweetbookTemplateDetail,
): boolean {
	const search = normalizeTemplateSearchText(
		detail.templateName,
		(detail as { theme?: string | null }).theme || null,
		detail.templateUid,
	);
	return (
		hasTemplateKeyword(search, [
			"내지 b",
			"내지b",
			"content b",
			"contentb",
		]) &&
		!hasTemplateKeyword(search, ["gallery"]) &&
		hasTemplateKeyword(search, ["일기장 b", "일기장b", "diary b", "diaryb"])
	);
}

function isStoryDateParameterKey(name: string): boolean {
	const search = normalizeTemplateSearchText(name);
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

function isNovelTitleParameterKey(name: string): boolean {
	const normalized = normalizeParameterKey(name);
	return normalized === "title" || normalized === "booktitle";
}

function isNovelDiaryTextParameterKey(name: string): boolean {
	return normalizeParameterKey(name) === "diarytext";
}

function isStoryCoverTitleParameterKey(name: string): boolean {
	const normalized = normalizeParameterKey(name);
	return normalized === "title" || normalized === "booktitle";
}

function isStoryCoverSubtitleParameterKey(name: string): boolean {
	return normalizeParameterKey(name) === "subtitle";
}

function isStoryCoverSpineTitleParameterKey(name: string): boolean {
	return normalizeParameterKey(name) === "spinetitle";
}

function getMonthNameCapitalized(month: number): string {
	const months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	return months[Math.max(0, Math.min(11, month - 1))];
}

function getDayOfWeekInfo(date: Date): {
	en: string;
	ko: string;
} {
	const english = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	const korean = ["일", "월", "화", "수", "목", "금", "토"];
	const day = date.getDay();
	return { en: english[day], ko: korean[day] };
}

function computeDayOfWeekXFromDateText(dateText: string): string {
	const text = String(dateText || "");
	let width = 0;
	for (const ch of text) {
		if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龥]/.test(ch)) {
			width += 24;
		} else if (/\d/.test(ch)) {
			width += 12;
		} else if (/\s/.test(ch)) {
			width += 8;
		} else {
			width += 10;
		}
	}
	return String(300 + width + 14);
}

function parseMonthDayFromDateText(dateText: string): {
	month?: number;
	day?: number;
} {
	const value = String(dateText || "").trim();
	if (!value) {
		return {};
	}

	const ko = value.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
	if (ko) {
		return { month: Number(ko[1]), day: Number(ko[2]) };
	}

	const dotted = value.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})/);
	if (dotted) {
		return { month: Number(dotted[1]), day: Number(dotted[2]) };
	}

	const onlyDay = value.match(/(\d{1,2})\s*일/);
	if (onlyDay) {
		return { day: Number(onlyDay[1]) };
	}

	return {};
}

function applyTemporalConsistency(parameters: Record<string, unknown>): void {
	const entries = Object.entries(parameters);

	const findKey = (normalized: string): string | null => {
		for (const [key] of entries) {
			if (normalizeParameterKey(key) === normalized) {
				return key;
			}
		}
		return null;
	};

	const readString = (normalized: string): string | null => {
		const key = findKey(normalized);
		if (!key) return null;
		const raw = parameters[key];
		if (raw === null || raw === undefined) return null;
		const text = String(raw).trim();
		return text || null;
	};

	const yearText = readString("year");
	const monthText = readString("month") || readString("monthnum");
	const dateText = readString("date") || readString("datelabel") || "";
	const dayText = readString("daynum") || readString("dayofmonth");

	const parsed = parseMonthDayFromDateText(dateText);
	const year = Number(yearText) || new Date().getFullYear();
	const month = Number(monthText) || parsed.month || 1;
	const day = Number(dayText) || parsed.day || 1;

	if (!Number.isFinite(month) || month < 1 || month > 12) {
		return;
	}
	if (!Number.isFinite(day) || day < 1 || day > 31) {
		return;
	}

	const normalizedDate = new Date(year, month - 1, day);
	if (Number.isNaN(normalizedDate.getTime())) {
		return;
	}

	const monthNum = String(month).padStart(2, "0");
	const monthName = getMonthNameCapitalized(month);
	const monthYearLabel = `${year}.${monthNum}`;
	const dateLabel = dateText || `${monthNum}.${String(day).padStart(2, "0")}`;
	const dayInfo = getDayOfWeekInfo(normalizedDate);
	const dayOfWeekX = computeDayOfWeekXFromDateText(dateLabel);

	for (const [key] of Object.entries(parameters)) {
		const normalized = normalizeParameterKey(key);
		if (normalized === "monthnum") {
			parameters[key] = monthNum;
		} else if (normalized === "monthnamecapitalized") {
			parameters[key] = monthName;
		} else if (normalized === "monthyearlabel") {
			parameters[key] = monthYearLabel;
		} else if (normalized === "dayofweek") {
			parameters[key] = dayInfo.en;
		} else if (normalized === "dayofweekkorean") {
			parameters[key] = dayInfo.ko;
		} else if (normalized === "dayofweekx") {
			parameters[key] = dayOfWeekX;
		}
	}
}

function pickMonthlyColor(month: number): string {
	const palette = [
		"#F97316",
		"#EAB308",
		"#84CC16",
		"#22C55E",
		"#14B8A6",
		"#06B6D4",
		"#3B82F6",
		"#6366F1",
		"#8B5CF6",
		"#D946EF",
		"#EC4899",
		"#EF4444",
	];
	return palette[Math.max(0, Math.min(11, month - 1))];
}

function buildTemplateTextRuntimeContext(params: {
	templateUid: string;
	templateName: string;
	templateKind: TemplateKind;
	project: TemplateProjectContext;
	page?: TemplatePageContext;
	createdDate: Date;
	periodText: string;
}): TemplateTextRuntimeContext {
	const {
		templateUid,
		templateName,
		templateKind,
		project,
		page,
		createdDate,
		periodText,
	} = params;
	const fallbackText =
		pickFirstString(
			project.coverCaption,
			project.synopsis,
			project.storyCharacters,
			project.genre,
			project.title,
		) || project.title;
	const month = createdDate.getMonth() + 1;
	const year = String(createdDate.getFullYear());
	const monthText = String(month);
	const monthPadded = monthText.padStart(2, "0");
	const dayOfMonth = String(createdDate.getDate()).padStart(2, "0");
	const pageNumber = String(page?.pageOrder || 1);
	const pageNumberPadded = pageNumber.padStart(2, "0");
	const monthNameCapitalized = getMonthNameCapitalized(month);
	const monthYearLabel = `${year}.${monthPadded}`;
	const dateLabel = `${monthPadded}.${pageNumberPadded}`;
	const dateRange = `${monthYearLabel}.01 - ${monthYearLabel}.31`;
	const coverSubtitle =
		pickFirstString(
			project.coverCaption,
			project.genre,
			project.synopsis,
		) || "우리의 기록";
	const spineTitle = project.title.slice(0, 24);
	const dayOfWeekInfo = getDayOfWeekInfo(createdDate);
	const monthColor = pickMonthlyColor(month);

	return {
		templateUid,
		templateName,
		templateKind,
		project,
		page,
		createdDate,
		periodText,
		year,
		month: monthText,
		monthPadded,
		dayOfMonth,
		pageNumber,
		pageNumberPadded,
		monthNameCapitalized,
		monthYearLabel,
		dateLabel,
		dateRange: project.projectType === "PHOTOBOOK" ? dateRange : "",
		fallbackText,
		coverSubtitle,
		spineTitle,
		dayOfWeek: dayOfWeekInfo.en,
		dayOfWeekKorean: dayOfWeekInfo.ko,
		monthColor,
		pointColor: monthColor,
	};
}

function resolveTemplateSpecificTextValue(
	search: string,
	runtime: TemplateTextRuntimeContext,
): string | null {
	const templateSearch = normalizeTemplateSearchText(
		runtime.templateUid,
		runtime.templateName,
	);

	if (hasTemplateKeyword(search, ["monthyearlabel", "month year label"])) {
		return runtime.monthYearLabel;
	}

	if (hasTemplateKeyword(search, ["monthnamecapitalized"])) {
		return runtime.monthNameCapitalized;
	}

	if (hasTemplateKeyword(search, ["dayofweekx"])) {
		return computeDayOfWeekXFromDateText(runtime.dateLabel);
	}

	if (hasTemplateKeyword(search, ["dayofweek"])) {
		return runtime.dayOfWeek;
	}

	if (hasTemplateKeyword(search, ["datelabel", "date label"])) {
		return runtime.dateLabel;
	}

	if (hasTemplateKeyword(search, ["daylabel", "day label"])) {
		return runtime.dateLabel;
	}

	if (hasTemplateKeyword(search, ["daterange", "date range"])) {
		return runtime.dateRange;
	}

	if (hasTemplateKeyword(search, ["spinetitle", "spine title"])) {
		return runtime.spineTitle;
	}

	if (hasTemplateKeyword(search, ["subtitle", "sub title", "소제목"])) {
		return runtime.coverSubtitle;
	}

	if (hasTemplateKeyword(search, ["monthcolor", "month color"])) {
		return runtime.monthColor;
	}

	if (hasTemplateKeyword(search, ["pointcolor", "point color"])) {
		return runtime.pointColor;
	}

	if (
		hasTemplateKeyword(search, [
			"hasparentcomment",
			"has parent comment",
			"hasteachercomment",
			"has teacher comment",
			"hasdaylabel",
			"has day label",
		])
	) {
		return "true";
	}

	if (hasTemplateKeyword(search, ["parentcomment", "parent comment"])) {
		return (
			pickFirstString(runtime.project.coverCaption) ||
			"오늘도 즐거운 하루였어요."
		);
	}

	if (hasTemplateKeyword(search, ["teachercomment", "teacher comment"])) {
		return (
			pickFirstString(runtime.project.synopsis, runtime.project.genre) ||
			"활동에 적극적으로 참여했어요."
		);
	}

	if (hasTemplateKeyword(search, ["weatherlabelx", "weather label x"])) {
		return "날씨";
	}

	if (hasTemplateKeyword(search, ["meallabelx", "meal label x"])) {
		return "급식";
	}

	if (hasTemplateKeyword(search, ["naplabelx", "nap label x"])) {
		return "낮잠";
	}

	if (hasTemplateKeyword(search, ["weathervaluex", "weather value x"])) {
		return "맑음";
	}

	if (hasTemplateKeyword(search, ["mealvaluex", "meal value x"])) {
		return "잘 먹음";
	}

	if (hasTemplateKeyword(search, ["napvaluex", "nap value x"])) {
		return "충분히 잠";
	}

	if (hasTemplateKeyword(search, ["weather"])) {
		return "맑음";
	}

	if (hasTemplateKeyword(search, ["meal"])) {
		return "좋음";
	}

	if (hasTemplateKeyword(search, ["nap"])) {
		return "좋음";
	}

	// template-specific fallback for known families
	if (templateSearch.includes("월시작")) {
		if (hasTemplateKeyword(search, ["date"])) {
			return `${runtime.monthPadded}.01`;
		}
	}

	if (templateSearch.includes("monthheader")) {
		if (hasTemplateKeyword(search, ["title"])) {
			return runtime.project.title;
		}
	}

	if (templateSearch.includes("빈내지")) {
		if (hasTemplateKeyword(search, ["booktitle", "title", "제목"])) {
			return runtime.project.title;
		}
	}

	if (templateSearch.includes("gallery")) {
		if (hasTemplateKeyword(search, ["date"])) {
			return runtime.dateLabel;
		}
	}

	if (templateSearch.includes("datea") || templateSearch.includes("dateb")) {
		if (hasTemplateKeyword(search, ["date"])) {
			return runtime.dateLabel;
		}
	}

	return null;
}

function resolveTemplateUidOverrideTextValue(
	name: string,
	runtime: TemplateTextRuntimeContext,
): string | null {
	const rule = TEMPLATE_UID_TEXT_OVERRIDES[runtime.templateUid];
	if (!rule) {
		return null;
	}

	const direct = rule[name];
	if (direct !== undefined) {
		return typeof direct === "function" ? direct(runtime) : direct;
	}

	const key = Object.keys(rule).find(
		(candidate) => candidate.toLowerCase() === name.toLowerCase(),
	);
	if (!key) {
		return null;
	}

	const value = rule[key];
	return typeof value === "function" ? value(runtime) : value;
}

function isPrimaryTemplateImageField(
	fieldName: string,
	definition: SweetbookTemplateParameterDefinition,
	kind: TemplateKind,
): boolean {
	const search = normalizeTemplateSearchText(
		fieldName,
		definition.label,
		definition.description,
	);

	const decorativeKeywords = [
		"icon",
		"logo",
		"line",
		"sticker",
		"mask",
		"overlay",
		"frame",
		"texture",
		"pattern",
		"pencil",
		"shape",
		"badge",
		"stamp",
		"배지",
		"라인",
		"아이콘",
		"프레임",
		"장식",
		"구분선",
	];

	if (hasTemplateKeyword(search, decorativeKeywords)) {
		return false;
	}

	const baseKeywords = [
		"photo",
		"image",
		"picture",
		"img",
		"art",
		"illustration",
		"scene",
		"background",
		"foreground",
		"cut",
		"panel",
		"사진",
		"이미지",
		"그림",
	];
	const kindKeywords =
		kind === "cover"
			? ["cover", "표지"]
			: ["page", "content", "내지", "페이지"];

	return hasTemplateKeyword(search, [...baseKeywords, ...kindKeywords]);
}

function formatPeriodText(date: Date): string {
	return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
		date.getDate(),
	).padStart(2, "0")}`;
}

function resolveTemplateTextValue(params: {
	name: string;
	definition: SweetbookTemplateParameterDefinition;
	runtime: TemplateTextRuntimeContext;
}): string | null {
	const { name, definition, runtime } = params;
	const search = normalizeTemplateSearchText(
		name,
		definition.label,
		definition.description,
	);
	const uidOverrideValue = resolveTemplateUidOverrideTextValue(name, runtime);
	if (uidOverrideValue !== null) {
		return uidOverrideValue;
	}

	const specificValue = resolveTemplateSpecificTextValue(search, runtime);
	if (specificValue !== null) {
		return specificValue;
	}

	if (hasTemplateKeyword(search, ["year", "년도", "연도"])) {
		return runtime.year;
	}

	if (hasTemplateKeyword(search, ["monthnum", "month num", "month", "월"])) {
		return search.includes("monthnum") || search.includes("month num")
			? runtime.monthPadded
			: runtime.month;
	}

	if (hasTemplateKeyword(search, ["daynum", "day num", "day", "일"])) {
		return runtime.templateKind === "content"
			? runtime.pageNumberPadded
			: runtime.dayOfMonth;
	}

	if (
		hasTemplateKeyword(search, [
			"period",
			"range",
			"date",
			"created",
			"published",
			"기간",
			"날짜",
		])
	) {
		return runtime.periodText;
	}

	if (
		hasTemplateKeyword(search, ["booktitle", "book title", "title", "제목"])
	) {
		return runtime.project.title;
	}

	if (
		hasTemplateKeyword(search, [
			"childname",
			"child name",
			"student",
			"kid",
			"name",
			"이름",
		])
	) {
		return runtime.project.title;
	}

	if (
		hasTemplateKeyword(search, [
			"school",
			"academy",
			"class",
			"kindergarten",
			"schoolname",
			"학교",
		])
	) {
		return "Momento";
	}

	if (
		hasTemplateKeyword(search, [
			"volume",
			"volumelabel",
			"volume label",
			"vol",
			"issue",
		])
	) {
		return "Vol.1";
	}

	if (
		hasTemplateKeyword(search, [
			"pageorder",
			"page order",
			"pagenum",
			"page num",
			"page",
			"index",
			"페이지",
			"쪽",
		])
	) {
		return runtime.pageNumber;
	}

	if (hasTemplateKeyword(search, ["genre", "장르"])) {
		return runtime.project.genre || runtime.fallbackText;
	}

	if (
		hasTemplateKeyword(search, [
			"character",
			"cast",
			"hero",
			"protagonist",
			"인물",
			"캐릭터",
		])
	) {
		return runtime.project.storyCharacters || runtime.fallbackText;
	}

	if (
		hasTemplateKeyword(search, [
			"synopsis",
			"summary",
			"outline",
			"description",
			"줄거리",
			"설명",
		])
	) {
		return runtime.project.synopsis || runtime.fallbackText;
	}

	if (
		hasTemplateKeyword(search, [
			"caption",
			"diary",
			"memo",
			"message",
			"quote",
			"text",
			"content",
			"body",
			"story",
			"subtitle",
			"tagline",
			"문구",
			"텍스트",
			"내용",
		])
	) {
		return runtime.fallbackText;
	}

	if (hasTemplateKeyword(search, ["cover", "표지"])) {
		return runtime.project.coverCaption || runtime.project.title;
	}

	if (
		hasTemplateKeyword(search, [
			"projecttype",
			"project type",
			"type",
			"형식",
		])
	) {
		return runtime.project.projectType;
	}

	if (
		hasTemplateKeyword(search, [
			"bookspec",
			"book spec",
			"format",
			"size",
			"판형",
		])
	) {
		return runtime.project.bookSpecUid || DEFAULT_PHOTOBOOK_SPEC_UID;
	}

	return definition.required ? runtime.fallbackText : null;
}

function resolveGenericParameterValue(params: {
	name: string;
	definition: SweetbookTemplateParameterDefinition;
	runtime: TemplateTextRuntimeContext;
}): unknown {
	const { name, definition, runtime } = params;
	const search = normalizeTemplateSearchText(
		name,
		definition.label,
		definition.description,
		definition.binding,
		typeof definition.default === "string" ? definition.default : "",
	);
	const type = String(definition.type || "").toLowerCase();
	const binding = String(definition.binding || "").toLowerCase();

	if (definition.default !== undefined) {
		return definition.default;
	}

	if (
		type.includes("array") ||
		binding.includes("gallery") ||
		binding.includes("row") ||
		hasTemplateKeyword(search, ["gallery", "row", "items", "list"])
	) {
		const sampleImageUrl =
			"https://picsum.photos/seed/momento-template/1200/900";
		return [
			{
				photo: sampleImageUrl,
				image: sampleImageUrl,
				url: sampleImageUrl,
				title: runtime.project.title,
				caption: runtime.fallbackText,
				text: runtime.fallbackText,
			},
		];
	}

	if (
		type.includes("boolean") ||
		hasTemplateKeyword(search, ["has", "use"])
	) {
		return true;
	}

	if (type.includes("number") || type.includes("integer")) {
		return Number(runtime.pageNumber) || 1;
	}

	if (type.includes("object")) {
		const sampleImageUrl =
			"https://picsum.photos/seed/momento-template/1200/900";
		return {
			photo: sampleImageUrl,
			image: sampleImageUrl,
			url: sampleImageUrl,
			title: runtime.project.title,
			caption: runtime.fallbackText,
			text: runtime.fallbackText,
		};
	}

	return runtime.fallbackText;
}

function shouldUseMultipleFiles(
	name: string,
	definition: SweetbookTemplateParameterDefinition,
): boolean {
	const search = normalizeTemplateSearchText(
		name,
		definition.label,
		definition.description,
		definition.binding,
		definition.type,
	);

	return (
		String(definition.type || "")
			.toLowerCase()
			.includes("array") ||
		hasTemplateKeyword(search, [
			"gallery",
			"items",
			"list",
			"rows",
			"photos",
		])
	);
}

function collectDefinitionFileValueCandidates(
	definition: SweetbookTemplateParameterDefinition,
): string[] {
	const candidates: string[] = [];
	const pushCandidate = (value: unknown) => {
		const extracted = extractImageUrlCandidate(value);
		if (extracted) {
			candidates.push(extracted);
		}
	};
	const pushPrimitiveCandidate = (value: unknown) => {
		if (typeof value !== "string") {
			return;
		}
		const trimmed = value.trim();
		if (trimmed) {
			candidates.push(trimmed);
		}
	};
	const pushOptionLikeCandidate = (value: unknown) => {
		if (!value || typeof value !== "object") {
			pushPrimitiveCandidate(value);
			return;
		}
		const record = value as Record<string, unknown>;
		for (const key of [
			"value",
			"id",
			"name",
			"key",
			"fileName",
			"filename",
			"url",
			"src",
		]) {
			pushPrimitiveCandidate(record[key]);
		}
		pushCandidate(value);
	};

	pushCandidate(definition.default);

	const raw = definition as Record<string, unknown>;
	for (const key of ["options", "enum", "values", "candidates"]) {
		const value = raw[key];
		if (!Array.isArray(value)) {
			continue;
		}
		for (const item of value) {
			pushOptionLikeCandidate(item);
		}
	}

	return Array.from(new Set(candidates));
}

function resolveOptionImageUrlByToken(params: {
	definition: SweetbookTemplateParameterDefinition;
	token: string;
}): string | null {
	const { definition, token } = params;
	const normalizedToken = String(token || "")
		.trim()
		.toLowerCase();
	if (!normalizedToken) {
		return null;
	}

	const raw = definition as Record<string, unknown>;
	const optionSources = [raw.options, raw.enum, raw.values, raw.candidates];

	for (const source of optionSources) {
		if (!Array.isArray(source)) {
			continue;
		}
		for (const item of source) {
			if (!item || typeof item !== "object") {
				continue;
			}
			const record = item as Record<string, unknown>;
			const tokenCandidates = [
				record.value,
				record.key,
				record.code,
				record.id,
				record.name,
			]
				.map((value) =>
					typeof value === "string" ? value.trim().toLowerCase() : "",
				)
				.filter(Boolean);

			if (!tokenCandidates.includes(normalizedToken)) {
				continue;
			}

			for (const key of [
				"iconUrl",
				"icon",
				"imageUrl",
				"image",
				"thumbnailUrl",
				"thumbnail",
				"previewUrl",
				"preview",
				"url",
				"src",
				"fileUrl",
			]) {
				const candidate = record[key];
				if (typeof candidate !== "string") {
					continue;
				}
				const trimmed = candidate.trim();
				if (isLikelyFileUrlCandidate(trimmed)) {
					return trimmed;
				}
			}
		}
	}

	return null;
}

function resolveAuxiliaryRequiredFileFallback(
	name: string,
	definition: SweetbookTemplateParameterDefinition,
): string | null {
	for (const candidate of collectDefinitionFileValueCandidates(definition)) {
		if (
			isLikelyFileUrlCandidate(candidate) ||
			isLikelyServerFileNameCandidate(candidate)
		) {
			return candidate;
		}
	}

	const search = normalizeTemplateSearchText(
		name,
		definition.label,
		definition.description,
	);

	if (search.includes("parent") && search.includes("balloon")) {
		return "b1";
	}
	if (search.includes("teacher") && search.includes("balloon")) {
		return "t1";
	}
	if (search.includes("child") && search.includes("balloon")) {
		return "c1";
	}
	if (search.includes("balloon") || search.includes("말풍선")) {
		return "b1";
	}
	if (
		search.includes("linevertical") ||
		search.includes("line vertical") ||
		search.includes("linehorizontal") ||
		search.includes("line horizontal") ||
		search.includes("line") ||
		search.includes("구분선") ||
		search.includes("라인")
	) {
		return "line1";
	}

	return null;
}

function hasUsableFileLikeParameterValue(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => hasUsableFileLikeParameterValue(item));
	}

	const candidate = extractImageUrlCandidate(value);
	if (!candidate) {
		return false;
	}

	return (
		isLikelyFileUrlCandidate(candidate) ||
		isLikelyServerFileNameCandidate(candidate)
	);
}

function hasAttachedFileValue(value: Blob | Blob[] | undefined): boolean {
	if (!value) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.length > 0;
	}
	return true;
}

function ensureRequiredImageLikeInputs(params: {
	detail: SweetbookTemplateDetail;
	kind: TemplateKind;
	parameters: Record<string, unknown>;
	files: Record<string, Blob | Blob[]>;
	fallbackImageBlob: Blob;
}) {
	const { detail, kind, parameters, files, fallbackImageBlob } = params;
	const definitions = detail.parameters?.definitions || {};

	for (const [name, definition] of Object.entries(definitions)) {
		if (!definition.required) {
			continue;
		}

		const search = normalizeTemplateSearchText(
			name,
			definition.label,
			definition.description,
			definition.binding,
		);
		const binding = String(definition.binding || "").toLowerCase();
		const isRequiredImageLike =
			isFileLikeBinding(binding) ||
			hasTemplateKeyword(search, [
				"linevertical",
				"linehorizontal",
				"balloon",
				"말풍선",
				"구분선",
				"라인",
				"image",
				"photo",
				"picture",
				"img",
				"이미지",
				"사진",
			]);

		if (!isRequiredImageLike) {
			continue;
		}

		if (hasAttachedFileValue(files[name])) {
			continue;
		}

		// token(b1 등)만 있는 경우, 템플릿 옵션의 실제 이미지 URL로 승격한다.
		if (typeof parameters[name] === "string") {
			const optionImageUrl = resolveOptionImageUrlByToken({
				definition,
				token: parameters[name] as string,
			});
			if (optionImageUrl) {
				parameters[name] = optionImageUrl;
			}
		}

		if (hasUsableFileLikeParameterValue(parameters[name])) {
			continue;
		}

		// 강제 안전망: required file-like 필드는 값이 비어 있으면 반드시 form-data 파일을 첨부한다.
		if (isFileLikeBinding(binding)) {
			files[name] = shouldUseMultipleFiles(name, definition)
				? [fallbackImageBlob]
				: fallbackImageBlob;

			const fallbackToken = resolveAuxiliaryRequiredFileFallback(
				name,
				definition,
			);
			if (fallbackToken) {
				parameters[name] = fallbackToken;
			}
			continue;
		}

		const isPrimaryImage = isPrimaryTemplateImageField(
			name,
			definition,
			kind,
		);
		if (isPrimaryImage || shouldUseMultipleFiles(name, definition)) {
			files[name] = shouldUseMultipleFiles(name, definition)
				? [fallbackImageBlob]
				: fallbackImageBlob;
			continue;
		}

		const fallback = resolveAuxiliaryRequiredFileFallback(name, definition);
		if (fallback) {
			parameters[name] = fallback;
			continue;
		}

		// 최종 폴백: known line field 기본 토큰
		if (search.includes("line")) {
			parameters[name] = "line1";
		}
	}
}

function buildTemplatePayload(params: {
	detail: SweetbookTemplateDetail;
	kind: TemplateKind;
	project: TemplateProjectContext;
	createdDate: Date;
	imageBlob: Blob;
	page?: TemplatePageContext;
}) {
	const { detail, kind, project, createdDate, imageBlob, page } = params;
	const definitions = detail.parameters?.definitions || {};
	const periodText = formatPeriodText(createdDate);
	const runtime = buildTemplateTextRuntimeContext({
		templateUid: detail.templateUid || "",
		templateName: detail.templateName || "",
		templateKind: kind,
		project,
		page,
		createdDate,
		periodText,
	});
	const parameters: Record<string, unknown> = {};
	const files: Record<string, Blob | Blob[]> = {};

	for (const [name, definition] of Object.entries(definitions)) {
		const binding = String(definition.binding || "").toLowerCase();

		// 텍스트 필드: binding이 text이거나, type이 string/textarea 등
		const type = String(definition.type || "").toLowerCase();
		const isTextField =
			binding === "text" || type === "string" || type === "textarea";
		if (isTextField) {
			// 필드명/라벨/설명 기반으로 적절한 값 생성
			const search = normalizeTemplateSearchText(
				name,
				definition.label,
				definition.description,
				definition.binding,
				type,
			);
			let value: string | null = null;
			if (hasTemplateKeyword(search, ["month", "월"])) {
				value = runtime.month;
			} else if (hasTemplateKeyword(search, ["year", "년도", "연도"])) {
				value = runtime.year;
			} else if (hasTemplateKeyword(search, ["day", "일"])) {
				value = runtime.dayOfMonth;
			} else if (hasTemplateKeyword(search, ["date", "날짜"])) {
				value = runtime.dateLabel;
			} else if (
				hasTemplateKeyword(search, ["period", "range", "기간"])
			) {
				value = runtime.periodText;
			} else if (hasTemplateKeyword(search, ["title", "제목"])) {
				value = runtime.project.title;
			} else if (
				hasTemplateKeyword(search, [
					"caption",
					"diary",
					"memo",
					"message",
					"quote",
					"text",
					"content",
					"body",
					"story",
					"subtitle",
					"tagline",
					"문구",
					"텍스트",
					"내용",
				])
			) {
				// 페이지 캡션 우선, 없으면 프로젝트 커버캡션/시놉시스/장르/제목 등
				value =
					(runtime.page && runtime.page.caption) ||
					runtime.project.coverCaption ||
					runtime.project.synopsis ||
					runtime.project.genre ||
					runtime.project.title;
			} else if (hasTemplateKeyword(search, ["genre", "장르"])) {
				value = runtime.project.genre || runtime.fallbackText;
			} else if (
				hasTemplateKeyword(search, [
					"character",
					"cast",
					"hero",
					"protagonist",
					"인물",
					"캐릭터",
				])
			) {
				value = runtime.project.storyCharacters || runtime.fallbackText;
			} else if (
				hasTemplateKeyword(search, [
					"synopsis",
					"summary",
					"outline",
					"description",
					"줄거리",
					"설명",
				])
			) {
				value = runtime.project.synopsis || runtime.fallbackText;
			} else if (hasTemplateKeyword(search, ["spinetitle"])) {
				value = runtime.spineTitle;
			} else if (hasTemplateKeyword(search, ["monthyearlabel"])) {
				value = runtime.monthYearLabel;
			} else if (hasTemplateKeyword(search, ["monthnamecapitalized"])) {
				value = runtime.monthNameCapitalized;
			} else if (hasTemplateKeyword(search, ["dayofweek"])) {
				value = runtime.dayOfWeek;
			} else if (hasTemplateKeyword(search, ["dayofweekkorean"])) {
				value = runtime.dayOfWeekKorean;
			} else if (
				hasTemplateKeyword(search, ["pointcolor", "monthcolor"])
			) {
				value = runtime.monthColor;
			} else if (
				hasTemplateKeyword(search, [
					"projecttype",
					"project type",
					"type",
					"형식",
				])
			) {
				value = runtime.project.projectType;
			} else if (
				hasTemplateKeyword(search, [
					"bookspec",
					"book spec",
					"format",
					"size",
					"판형",
				])
			) {
				value =
					runtime.project.bookSpecUid || DEFAULT_PHOTOBOOK_SPEC_UID;
			} else {
				value = runtime.fallbackText;
			}
			parameters[name] = value;
			continue;
		}

		if (binding === "file") {
			const shouldAutofillImage = isPrimaryTemplateImageField(
				name,
				definition,
				kind,
			);
			const isRequired = Boolean(definition.required);
			// 반드시 required가 true인 경우에만 자동 첨부
			if (isRequired) {
				if (!shouldAutofillImage) {
					// required + multi-file(gallery)는 최소 1장 이상 첨부되도록 안전망 적용.
					if (shouldUseMultipleFiles(name, definition)) {
						files[name] = [imageBlob];
						continue;
					}
					// Decorative/auxiliary required file fields need a safe fallback token.
					const fallback = resolveAuxiliaryRequiredFileFallback(
						name,
						definition,
					);
					if (fallback) {
						parameters[name] = fallback;
					}
					continue;
				}
				// 메인 이미지 필드(required=true)만 첨부
				if (shouldUseMultipleFiles(name, definition)) {
					files[name] = [imageBlob];
				} else {
					files[name] = imageBlob;
				}
			}
			// required가 false면 어떤 경우에도 자동 첨부하지 않음
			continue;
		}

		if (binding) {
			parameters[name] = resolveGenericParameterValue({
				name,
				definition,
				runtime,
			});
		}
	}

	return { parameters, files };
}

function assertTemplateCompatibility(params: {
	detail: SweetbookTemplateDetail;
	templateUid: string;
	expectedKind: TemplateKind;
	bookSpecUid: string;
}) {
	const { detail, templateUid, expectedKind, bookSpecUid } = params;
	if (detail.bookSpecUid && detail.bookSpecUid !== bookSpecUid) {
		console.warn(
			`[publish] 템플릿 판형 불일치 감지 - template=${detail.templateName || templateUid}, expectedBookSpec=${bookSpecUid}, templateBookSpec=${detail.bookSpecUid}`,
		);
	}

	const actualKind = String(detail.templateKind || "").toLowerCase();
	if (actualKind && actualKind !== expectedKind) {
		console.warn(
			`[publish] 템플릿 kind 불일치 감지 - template=${detail.templateName || templateUid}, expectedKind=${expectedKind}, actualKind=${actualKind}`,
		);
	}
}

/**
 * POST /api/projects/[id]/publish
 *
 * 포토북을 Sweetbook API에 전송하는 전체 흐름:
 *  1. Book 생성
 *  2. 표지 추가
 *  3. 내지 페이지 추가
 *  4. 최종화
 *  5. 로컬 DB 상태 업데이트
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	let coverTemplateDetail: SweetbookTemplateDetail | null = null;
	let contentTemplateDetail: SweetbookTemplateDetail | null = null;
	let failedStep = "initial";
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const project = await prisma.project.findFirst({
			where: { id: params.id, userId: user.id },
			include: { pages: { orderBy: { pageOrder: "asc" } } },
		});

		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}

		// 멱등 처리: 이미 발행(또는 주문)된 프로젝트는 재발행하지 않고 성공으로 응답한다.
		if (
			(project.status === "PUBLISHED" || project.status === "ORDERED") &&
			project.bookUid
		) {
			return NextResponse.json({
				success: true,
				bookUid: project.bookUid,
				message: "이미 발행이 완료된 프로젝트입니다.",
			});
		}

		if (project.pages.length === 0) {
			return NextResponse.json(
				{ success: false, error: "최소 1페이지 이상 필요합니다." },
				{ status: 400 },
			);
		}

		const bookSpecUid = project.bookSpecUid || DEFAULT_PHOTOBOOK_SPEC_UID;
		if (
			project.projectType === "COMIC" &&
			bookSpecUid !== "SQUAREBOOK_HC"
		) {
			return NextResponse.json(
				{
					success: false,
					error: "만화책은 고화질 스퀘어북(SQUAREBOOK_HC) 판형만 지원합니다.",
				},
				{ status: 400 },
			);
		}
		const minPages = getMinPagesByBookSpec(bookSpecUid);
		if (project.pages.length < minPages) {
			return NextResponse.json(
				{
					success: false,
					error: `${bookSpecUid} 판형은 최소 ${minPages}페이지가 필요합니다. (현재 ${project.pages.length}페이지)`,
				},
				{ status: 400 },
			);
		}

		if (!isSweetbookConfigured()) {
			await prisma.project.update({
				where: { id: project.id },
				data: { status: "PUBLISHED" },
			});

			return NextResponse.json({
				success: true,
				demo: true,
				message:
					"Demo 모드: SWEETBOOK_API_KEY 미설정. 주문 페이지로 이동하지만 실제 API 호출은 생략됩니다.",
			});
		}

		const requestBody = await parsePublishRequestBody(req);
		const publishBody: PublishRequestBody = {
			coverOverrides: mergeTemplateOverrideValues(
				sanitizeTemplateOverrides(project.coverTemplateOverrides),
				requestBody.coverOverrides,
			),
			contentOverrides: mergeTemplateOverrideValues(
				sanitizeTemplateOverrides(project.contentTemplateOverrides),
				requestBody.contentOverrides,
			),
			contentPageOverrides: requestBody.contentPageOverrides,
		};
		const client = getSweetbookClient();
		const createBookAndGetUid = async () => {
			const book = (await client.books.create({
				bookSpecUid,
				title: project.title,
				creationType: "EBOOK_SYNC",
			})) as { bookUid?: string };

			const nextBookUid = book.bookUid || null;
			if (!nextBookUid) {
				throw new Error("Book 생성 후 bookUid를 받지 못했습니다.");
			}

			return nextBookUid;
		};

		let bookUid = project.bookUid;
		if (!bookUid) {
			bookUid = await createBookAndGetUid();
			// bookUid를 즉시 DB에 저장: 이후 단계에서 실패해도 재시도 시 재사용 가능
			await prisma.project.update({
				where: { id: project.id },
				data: { bookUid } as any,
			});
		}

		const coverTemplateUid =
			project.coverTemplateUid ||
			process.env.SWEETBOOK_COVER_TEMPLATE_UID;
		const fallbackContentTemplateUid =
			project.contentTemplateUid ||
			process.env.SWEETBOOK_CONTENT_TEMPLATE_UID;

		if (
			!coverTemplateUid ||
			coverTemplateUid === "YOUR_COVER_TEMPLATE_UID"
		) {
			throw new Error(
				"SWEETBOOK_COVER_TEMPLATE_UID가 설정되지 않았습니다. GET /api/templates 로 템플릿 목록을 조회한 후 .env 에 입력하세요.",
			);
		}

		const coverBlob = project.coverImageUrl
			? await fetchImageBlob(project.coverImageUrl, req.nextUrl.origin)
			: new Blob();
		failedStep = "fetch-template-detail";
		const createdDate = project.createdAt
			? new Date(project.createdAt)
			: new Date();
		coverTemplateDetail =
			await fetchSweetbookTemplateDetail(coverTemplateUid);

		if (
			project.projectType !== "PHOTOBOOK" &&
			isDisallowedStoryCoverTemplate(coverTemplateDetail)
		) {
			throw new Error(
				"만화책/소설 프로젝트에서는 알림장 계열 표지 템플릿을 사용할 수 없습니다.",
			);
		}

		assertTemplateCompatibility({
			detail: coverTemplateDetail,
			templateUid: coverTemplateUid,
			expectedKind: "cover",
			bookSpecUid,
		});
		const templateProject: TemplateProjectContext = {
			title: project.title,
			coverCaption: project.coverCaption,
			synopsis: project.synopsis,
			storyCharacters: project.storyCharacters,
			genre: project.genre,
			bookSpecUid: project.bookSpecUid,
			projectType: project.projectType,
		};
		const coverPayload = buildTemplatePayload({
			detail: coverTemplateDetail,
			kind: "cover",
			project: templateProject,
			createdDate,
			imageBlob: coverBlob,
		});
		const mergedCoverParameters = {
			...coverPayload.parameters,
			...(publishBody.coverOverrides?.parameters || {}),
		};

		// 표지 URL 오버라이드 적용 및 cover API 호출
		const coverFileUrlOverrides: Record<string, string | string[]> = {
			...(publishBody.coverOverrides?.fileUrls || {}),
		};
		for (const [paramName, definition] of Object.entries(
			coverTemplateDetail.parameters?.definitions || {},
		)) {
			if (!isFileLikeBinding(definition.binding)) continue;
			if (coverFileUrlOverrides[paramName] !== undefined) continue;
			const urls = parsePotentialFileUrls(
				mergedCoverParameters[paramName],
			);
			if (urls.length === 0) continue;
			coverFileUrlOverrides[paramName] =
				urls.length === 1 ? urls[0] : urls;
			delete mergedCoverParameters[paramName];
		}
		const coverFileOverrideResult = await applyFileUrlOverrides({
			baseFiles: coverPayload.files,
			fileUrls: coverFileUrlOverrides,
			origin: req.nextUrl.origin,
		});
		Object.assign(
			mergedCoverParameters,
			coverFileOverrideResult.parameterFileValues,
		);
		ensureRequiredImageLikeInputs({
			detail: coverTemplateDetail,
			kind: "cover",
			parameters: mergedCoverParameters,
			files: coverFileOverrideResult.files,
			fallbackImageBlob: coverBlob,
		});
		applyTemporalConsistency(mergedCoverParameters);

		failedStep = "create-cover";
		await postSweetbookTemplateForm(
			`/Books/${bookUid}/cover`,
			coverTemplateUid,
			mergedCoverParameters,
			coverFileOverrideResult.files,
		);

		// 각 페이지별로 contentTemplateDetail을 사용하여 처리
		for (const page of project.pages) {
			// contentTemplateDetail이 없으면 fetch
			if (!contentTemplateDetail) {
				const contentTemplateUid =
					project.contentTemplateUid || fallbackContentTemplateUid;
				if (!contentTemplateUid) {
					throw new Error(
						"contentTemplateUid가 지정되지 않았습니다.",
					);
				}
				contentTemplateDetail =
					await fetchSweetbookTemplateDetail(contentTemplateUid);
			}
			const pageParameterDefinitions = (contentTemplateDetail.parameters
				?.definitions || {}) as Record<
				string,
				SweetbookTemplateParameterDefinition
			>;
			const pageTemplateHasPrimaryImageBinding = Object.entries(
				pageParameterDefinitions,
			).some(([name, def]) => {
				const binding = String(
					(def as SweetbookTemplateParameterDefinition).binding || "",
				).toLowerCase();
				return (
					binding === "file" &&
					isPrimaryTemplateImageField(
						name,
						def as SweetbookTemplateParameterDefinition,
						"content",
					)
				);
			});
			const shouldAttachPageImage =
				project.projectType !== "NOVEL" &&
				pageTemplateHasPrimaryImageBinding &&
				Boolean(String((page as any).imageUrl || "").trim());
			const pageBlob = shouldAttachPageImage
				? await fetchImageBlob(
						(page as any).imageUrl,
						req.nextUrl.origin,
					)
				: new Blob();
			const contentPayload = buildTemplatePayload({
				detail: contentTemplateDetail,
				kind: "content",
				project: templateProject,
				createdDate,
				imageBlob: pageBlob,
				page: {
					pageOrder: (page as any).pageOrder,
					caption: (page as any).caption || "",
				},
			});
			const requestPageOverrides =
				publishBody.contentPageOverrides?.[
					String((page as any).pageOrder)
				];
			const persistedPageOverrides = parseTemplateOverridesFromUnknown(
				(page as any).contentTemplateOverrides,
			);
			const pageOverrides = mergeTemplateOverrideValues(
				persistedPageOverrides,
				requestPageOverrides,
			);
			const mergedContentParameters = {
				...contentPayload.parameters,
				...(publishBody.contentOverrides?.parameters || {}),
				...(pageOverrides?.parameters || {}),
			};
			applyTemporalConsistency(mergedContentParameters);
			if (
				project.projectType === "COMIC" ||
				project.projectType === "NOVEL"
			) {
				for (const key of Object.keys(mergedContentParameters)) {
					if (isStoryDateParameterKey(key)) {
						mergedContentParameters[key] = "";
					}
				}
			}
			if (project.projectType === "NOVEL") {
				for (const key of Object.keys(mergedContentParameters)) {
					if (isNovelTitleParameterKey(key)) {
						mergedContentParameters[key] = "";
						continue;
					}
					if (isNovelDiaryTextParameterKey(key)) {
						mergedContentParameters[key] =
							(page as any).caption || "";
					}
				}
			}
			const mergedContentFileUrls: Record<string, string | string[]> =
				project.projectType === "NOVEL"
					? {}
					: {
							...(publishBody.contentOverrides?.fileUrls || {}),
							...(pageOverrides?.fileUrls || {}),
						};
			for (const [paramName, definition] of Object.entries(
				pageParameterDefinitions,
			)) {
				const defTyped =
					definition as SweetbookTemplateParameterDefinition;
				if (project.projectType === "NOVEL") {
					break;
				}
				if (!isFileLikeBinding(defTyped.binding)) {
					continue;
				}

				if (mergedContentFileUrls[paramName] !== undefined) {
					continue;
				}

				const urls = parsePotentialFileUrls(
					mergedContentParameters[paramName],
				);
				if (urls.length === 0) {
					continue;
				}

				mergedContentFileUrls[paramName] =
					urls.length === 1 ? urls[0] : urls;
				delete mergedContentParameters[paramName];
			}

			const mergedContentOverrideResult = await applyFileUrlOverrides({
				baseFiles:
					project.projectType === "NOVEL" ? {} : contentPayload.files,
				fileUrls: mergedContentFileUrls,
				origin: req.nextUrl.origin,
			});
			Object.assign(
				mergedContentParameters,
				mergedContentOverrideResult.parameterFileValues,
			);
			ensureRequiredImageLikeInputs({
				detail: contentTemplateDetail,
				kind: "content",
				parameters: mergedContentParameters,
				files: mergedContentOverrideResult.files,
				fallbackImageBlob: pageBlob,
			});

			failedStep = `create-content-page-${(page as any).pageOrder}`;
			await postSweetbookTemplateForm(
				`/Books/${bookUid}/contents`,
				String(contentTemplateDetail.templateUid),
				mergedContentParameters,
				mergedContentOverrideResult.files,
				{ breakBefore: "page" },
			);
		}

		failedStep = "finalize";
		await client.books.finalize(bookUid);

		let estimate: {
			totalPrice: number | null;
			unitPrice: number | null;
			itemAmount: number | null;
			shippingFee: number;
			currency: string;
			raw: Record<string, unknown> | null;
		} | null = null;

		const result = (await client.orders.estimate({
			items: [{ bookUid, quantity: 1 }],
		})) as Record<string, unknown>;

		const firstItem = Array.isArray(result.items)
			? ((result.items[0] as Record<string, unknown>) ?? null)
			: null;

		const unitPrice = pickFirstNumber(
			firstItem?.unitPrice,
			result.unitPrice,
		);
		const itemAmount = pickFirstNumber(
			firstItem?.itemAmount,
			result.itemAmount,
			unitPrice !== null ? unitPrice : null,
		);
		const shippingFee =
			pickFirstNumber(result.shippingFee, firstItem?.shippingFee) ?? 0;
		const totalPrice = pickFirstNumber(
			result.totalPrice,
			result.totalAmount,
			result.price,
			result.amount,
			result.finalPrice,
			itemAmount !== null ? itemAmount + shippingFee : null,
		);
		const currency =
			pickFirstString(result.currency, result.currencyCode) || "KRW";

		estimate = {
			totalPrice,
			unitPrice,
			itemAmount,
			shippingFee,
			currency,
			raw: result,
		};

		await prisma.project.update({
			where: { id: project.id },
			data: { bookUid, status: "PUBLISHED" },
		});

		return NextResponse.json({ success: true, bookUid, estimate });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "알 수 없는 오류";
		console.error("[POST /api/projects/[id]/publish]", err);
		return NextResponse.json(
			{
				success: false,
				error: message,
				failedStep,
				requiredInputs: {
					cover:
						typeof coverTemplateDetail !== "undefined" &&
						coverTemplateDetail
							? collectTemplateRequiredFields(coverTemplateDetail)
							: [],
					content:
						typeof contentTemplateDetail !== "undefined" &&
						contentTemplateDetail
							? collectTemplateRequiredFields(
									contentTemplateDetail,
								)
							: [],
				},
				hint: "요청 바디에 coverOverrides/contentOverrides/contentPageOverrides를 전달하면 템플릿별 필수값을 직접 보정할 수 있습니다.",
			},
			{ status: 500 },
		);
	}
}
