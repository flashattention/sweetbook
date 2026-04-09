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

interface PublishTemplateOverrides {
	parameters?: Record<string, unknown>;
	fileUrls?: Record<string, string | string[]>;
}

interface PublishRequestBody {
	coverOverrides?: PublishTemplateOverrides;
	contentOverrides?: PublishTemplateOverrides;
	contentPageOverrides?: Record<string, PublishTemplateOverrides>;
}

function sanitizeTemplateOverrides(
	value: unknown,
): PublishTemplateOverrides | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const parameters =
		raw.parameters && typeof raw.parameters === "object"
			? (raw.parameters as Record<string, unknown>)
			: undefined;
	const fileUrls =
		raw.fileUrls && typeof raw.fileUrls === "object"
			? (raw.fileUrls as Record<string, string | string[]>)
			: undefined;
	return { parameters, fileUrls };
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
}): Promise<Record<string, Blob | Blob[]>> {
	const { baseFiles, fileUrls, origin } = params;
	if (!fileUrls) {
		return baseFiles;
	}

	const merged: Record<string, Blob | Blob[]> = { ...baseFiles };
	for (const [fieldName, value] of Object.entries(fileUrls)) {
		const urls = Array.isArray(value) ? value : [value];
		const cleanedUrls = urls
			.filter((url): url is string => typeof url === "string")
			.map((url) => url.trim())
			.filter(Boolean);

		if (cleanedUrls.length === 0) {
			continue;
		}

		const blobs: Blob[] = [];
		for (const imageUrl of cleanedUrls) {
			const blob = await fetchImageBlob(imageUrl, origin);
			blobs.push(blob);
		}

		merged[fieldName] = blobs.length === 1 ? blobs[0] : blobs;
	}

	return merged;
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
			templateKind === "content" ? page?.caption : null,
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
		dateRange,
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
		return runtime.dayOfWeekKorean;
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
			pickFirstString(
				runtime.page?.caption,
				runtime.project.coverCaption,
			) || "오늘도 즐거운 하루였어요."
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

		if (binding === "text") {
			const value = resolveTemplateTextValue({
				name,
				definition,
				runtime,
			});
			parameters[name] = value ?? runtime.fallbackText;
			continue;
		}

		if (binding === "file") {
			if (shouldUseMultipleFiles(name, definition)) {
				files[name] = [imageBlob];
			} else {
				files[name] = imageBlob;
			}
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

	// 일부 템플릿은 메인 이미지 필드를 file binding이 아닌 확장 바인딩으로 요구하므로,
	// parameters에도 URL 기반 폴백을 추가한다.
	for (const [name, definition] of Object.entries(definitions)) {
		const binding = String(definition.binding || "").toLowerCase();
		if (binding !== "file") {
			continue;
		}
		if (name in parameters) {
			continue;
		}
		if (isPrimaryTemplateImageField(name, definition, kind)) {
			parameters[name] =
				"https://picsum.photos/seed/momento-template/1200/900";
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

	if (!project.coverImageUrl) {
		return NextResponse.json(
			{ success: false, error: "표지 이미지를 설정해 주세요." },
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

	let coverTemplateDetail: SweetbookTemplateDetail | null = null;
	let contentTemplateDetail: SweetbookTemplateDetail | null = null;
	let failedStep = "initial";

	try {
		const publishBody = await parsePublishRequestBody(req);
		const client = getSweetbookClient();

		let bookUid = project.bookUid;
		if (!bookUid) {
			const book = (await client.books.create({
				bookSpecUid,
				title: project.title,
				creationType: "NORMAL",
			})) as { bookUid?: string };

			bookUid = book.bookUid || null;
			if (!bookUid) {
				throw new Error("Book 생성 후 bookUid를 받지 못했습니다.");
			}
		}

		const coverTemplateUid =
			project.coverTemplateUid ||
			process.env.SWEETBOOK_COVER_TEMPLATE_UID;
		const contentTemplateUid =
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

		if (
			!contentTemplateUid ||
			contentTemplateUid === "YOUR_CONTENT_TEMPLATE_UID"
		) {
			throw new Error(
				"SWEETBOOK_CONTENT_TEMPLATE_UID가 설정되지 않았습니다. GET /api/templates 로 템플릿 목록을 조회한 후 .env 에 입력하세요.",
			);
		}

		const coverBlob = await fetchImageBlob(
			project.coverImageUrl,
			req.nextUrl.origin,
		);
		failedStep = "fetch-template-detail";
		const createdDate = project.createdAt
			? new Date(project.createdAt)
			: new Date();
		coverTemplateDetail =
			await fetchSweetbookTemplateDetail(coverTemplateUid);
		contentTemplateDetail =
			await fetchSweetbookTemplateDetail(contentTemplateUid);

		assertTemplateCompatibility({
			detail: coverTemplateDetail,
			templateUid: coverTemplateUid,
			expectedKind: "cover",
			bookSpecUid,
		});
		assertTemplateCompatibility({
			detail: contentTemplateDetail,
			templateUid: contentTemplateUid,
			expectedKind: "content",
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
		const mergedCoverFiles = await applyFileUrlOverrides({
			baseFiles: coverPayload.files,
			fileUrls: publishBody.coverOverrides?.fileUrls,
			origin: req.nextUrl.origin,
		});

		failedStep = "create-cover";
		await postSweetbookTemplateForm(
			`/Books/${bookUid}/cover`,
			coverTemplateUid,
			mergedCoverParameters,
			mergedCoverFiles,
		);

		for (const page of project.pages) {
			const pageBlob = await fetchImageBlob(
				page.imageUrl,
				req.nextUrl.origin,
			);
			const contentPayload = buildTemplatePayload({
				detail: contentTemplateDetail,
				kind: "content",
				project: templateProject,
				createdDate,
				imageBlob: pageBlob,
				page: {
					pageOrder: page.pageOrder,
					caption: page.caption || "",
				},
			});
			const pageOverrides =
				publishBody.contentPageOverrides?.[String(page.pageOrder)];
			const mergedContentParameters = {
				...contentPayload.parameters,
				...(publishBody.contentOverrides?.parameters || {}),
				...(pageOverrides?.parameters || {}),
			};
			const mergedContentFiles = await applyFileUrlOverrides({
				baseFiles: contentPayload.files,
				fileUrls: {
					...(publishBody.contentOverrides?.fileUrls || {}),
					...(pageOverrides?.fileUrls || {}),
				},
				origin: req.nextUrl.origin,
			});

			failedStep = `create-content-page-${page.pageOrder}`;
			await postSweetbookTemplateForm(
				`/Books/${bookUid}/contents`,
				contentTemplateUid,
				mergedContentParameters,
				mergedContentFiles,
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

		try {
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
				pickFirstNumber(result.shippingFee, firstItem?.shippingFee) ??
				0;
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
		} catch (estimateError) {
			console.error(
				"[POST /api/projects/[id]/publish] estimate after finalize failed",
				estimateError,
			);
		}

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
					cover: coverTemplateDetail
						? collectTemplateRequiredFields(coverTemplateDetail)
						: [],
					content: contentTemplateDetail
						? collectTemplateRequiredFields(contentTemplateDetail)
						: [],
				},
				hint: "요청 바디에 coverOverrides/contentOverrides/contentPageOverrides를 전달하면 템플릿별 필수값을 직접 보정할 수 있습니다.",
			},
			{ status: 500 },
		);
	}
}
