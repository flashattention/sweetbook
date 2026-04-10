"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Project, Page } from "@/types";
import {
	buildTemplateOverrides,
	type PublishTemplateOverrides,
	type TemplateRequiredInput,
} from "@/lib/template-overrides";

interface Props {
	initialProject: Project;
}

interface RequiredTemplateInputField {
	name: string;
	binding?: string | null;
	type?: string | null;
	label?: string | null;
	description?: string | null;
	defaultValue?: string | null;
	options?: Array<{ label: string; value: string }>;
}

interface PublishErrorPayload {
	success?: boolean;
	error?: string;
	estimate?: { totalPrice?: number };
}

interface ContentTemplateItem {
	templateUid: string;
	templateName: string;
	templateKind: string;
	bookSpecUid: string;
	requiredInputs?: TemplateRequiredInput[];
	theme?: string | null;
	thumbnails?: {
		layout?: string;
	} | null;
}

type ActiveTab = "cover" | string; // 'cover' | pageId

const TEMPLATE_FINGERPRINT_PARAM_KEY = "__sbTemplateFingerprint";

function normalizeTemplateFingerprintToken(value: unknown): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
}

function buildTemplateFingerprint(template: {
	templateKind?: string | null;
	bookSpecUid?: string | null;
	templateName?: string | null;
	theme?: string | null;
	requiredInputs?: Array<{ name?: string | null }>;
}): string {
	const fieldNames = (template.requiredInputs || [])
		.map((field) => normalizeTemplateFingerprintToken(field?.name || ""))
		.filter(Boolean)
		.sort()
		.join("|");

	return [
		normalizeTemplateFingerprintToken(template.bookSpecUid || ""),
		normalizeTemplateFingerprintToken(template.templateKind || ""),
		normalizeTemplateFingerprintToken(template.templateName || ""),
		normalizeTemplateFingerprintToken(template.theme || ""),
		fieldNames,
	].join("::");
}

function getTemplateFingerprintFromOverrides(
	overrides?: PublishTemplateOverrides | null,
): string | null {
	if (!overrides?.parameters) {
		return null;
	}
	const raw = overrides.parameters[TEMPLATE_FINGERPRINT_PARAM_KEY];
	if (typeof raw !== "string") {
		return null;
	}
	const normalized = normalizeTemplateFingerprintToken(raw);
	return normalized || null;
}

function withTemplateFingerprint(
	overrides: PublishTemplateOverrides | undefined,
	template: ContentTemplateItem,
): PublishTemplateOverrides {
	const fingerprint = buildTemplateFingerprint(template);
	return {
		parameters: {
			...(overrides?.parameters || {}),
			[TEMPLATE_FINGERPRINT_PARAM_KEY]: fingerprint,
		},
		fileUrls: { ...(overrides?.fileUrls || {}) },
	};
}

function parseUserInputByType(
	value: string,
	type: string | null | undefined,
): unknown {
	const t = String(type || "").toLowerCase();
	if (t.includes("boolean")) {
		return value.toLowerCase() === "true";
	}
	if (t.includes("number") || t.includes("integer")) {
		const n = Number(value);
		return Number.isFinite(n) ? n : value;
	}
	if (t.includes("array")) {
		return value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
	}
	if (t.includes("object")) {
		try {
			return JSON.parse(value);
		} catch {
			return { value };
		}
	}
	return value;
}

function toInputValueMap(
	overrides?: PublishTemplateOverrides | null,
): Record<string, string> {
	if (!overrides) {
		return {};
	}

	const values: Record<string, string> = {};
	for (const [key, value] of Object.entries(overrides.parameters || {})) {
		if (typeof value === "string") {
			values[key] = value;
		} else {
			values[key] = JSON.stringify(value);
		}
	}

	for (const [key, value] of Object.entries(overrides.fileUrls || {})) {
		if (Array.isArray(value)) {
			values[key] = value.join(", ");
		} else {
			values[key] = String(value);
		}
	}

	return values;
}

function normalizeTemplateFieldSearch(...values: Array<unknown>): string {
	return values
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeFieldKey(name: string): string {
	return String(name || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function getFieldDisplayLabel(field: {
	name?: string | null;
	label?: string | null;
}): string {
	const key = normalizeFieldKey(field.name || "");
	const labelMap: Record<string, string> = {
		covercaption: "표지 문구",
		childname: "아이 이름",
		chldname: "아이 이름",
		schoolname: "기관명",
		booktitle: "책 제목",
		bookname: "책 제목",
		date: "날짜",
		datex: "날짜",
		datea: "날짜",
		dateb: "날짜",
		todaydate: "오늘 날짜",
		createddate: "생성 날짜",
		startdate: "시작 날짜",
		enddate: "종료 날짜",
		datetext: "날짜 문구",
		year: "연도",
		month: "월",
		monthpadded: "월(2자리)",
		monthnamecapitalized: "월 이름",
		monthyearlabel: "연월 표기",
		dayofmonth: "일",
		dayofweek: "요일",
		dayofweekkorean: "요일(한글)",
		pagenumber: "페이지 번호",
		pagenumberpadded: "페이지 번호(2자리)",
		datelabel: "날짜 라벨",
		daylabelx: "날짜 라벨",
		hasdaylabel: "날짜 라벨 표시 여부",
		volumelabel: "권수",
		periodtext: "기록 날짜",
		daterange: "기간",
		title: "제목",
		pagetitle: "페이지 제목",
		pagetext: "페이지 문구",
		contenttext: "본문",
		caption: "페이지 문구",
		subtitle: "부제",
		spinetitle: "등표지 문구",
		monthnum: "월",
		daynum: "일",
		diarytext: "본문",
		fallbacktext: "기본 문구",
		monthcolor: "월 색상",
		pointcolor: "포인트 색상",
		balloon: "말풍선",
		parentballoon: "부모 말풍선",
		teacherballoon: "교사 말풍선",
		childballoon: "아이 말풍선",
		hasballoon: "말풍선 표시 여부",
		parentcomment: "부모 코멘트",
		teachercomment: "교사 코멘트",
		hasparentcomment: "부모 코멘트 표시 여부",
		hasteachercomment: "교사 코멘트 표시 여부",
		weatherlabelx: "날씨 라벨",
		weathervaluex: "날씨 값",
		meallabelx: "급식 라벨",
		mealvaluex: "급식 값",
		naplabelx: "낮잠 라벨",
		napvaluex: "낮잠 값",
		photo: "사진",
		coverphoto: "표지 이미지",
		frontphoto: "표지 이미지",
		collagephotos: "콜라주 이미지",
	};

	if (labelMap[key]) {
		return labelMap[key];
	}

	const search = normalizeTemplateFieldSearch(field.name, field.label);
	const inferRules: Array<{ keywords: string[]; label: string }> = [
		{ keywords: ["parent", "balloon"], label: "부모 말풍선" },
		{ keywords: ["teacher", "balloon"], label: "교사 말풍선" },
		{ keywords: ["child", "balloon"], label: "아이 말풍선" },
		{ keywords: ["balloon"], label: "말풍선" },
		{ keywords: ["parent", "comment"], label: "부모 코멘트" },
		{ keywords: ["teacher", "comment"], label: "교사 코멘트" },
		{ keywords: ["comment"], label: "코멘트" },
		{ keywords: ["day", "of", "week"], label: "요일" },
		{ keywords: ["month", "name"], label: "월 이름" },
		{ keywords: ["month", "year"], label: "연월 표기" },
		{ keywords: ["date", "range"], label: "기간" },
		{ keywords: ["start", "date"], label: "시작 날짜" },
		{ keywords: ["end", "date"], label: "종료 날짜" },
		{ keywords: ["date"], label: "날짜" },
		{ keywords: ["year"], label: "연도" },
		{ keywords: ["month"], label: "월" },
		{ keywords: ["day"], label: "일" },
		{ keywords: ["page", "number"], label: "페이지 번호" },
		{ keywords: ["page"], label: "페이지" },
		{ keywords: ["book", "title"], label: "책 제목" },
		{ keywords: ["title"], label: "제목" },
		{ keywords: ["subtitle"], label: "부제" },
		{ keywords: ["spine", "title"], label: "등표지 문구" },
		{ keywords: ["period"], label: "기록 날짜" },
		{ keywords: ["volume"], label: "권수" },
		{ keywords: ["school"], label: "기관명" },
		{ keywords: ["child", "name"], label: "아이 이름" },
		{ keywords: ["name"], label: "이름" },
		{ keywords: ["caption"], label: "페이지 문구" },
		{ keywords: ["diary"], label: "본문" },
		{ keywords: ["content"], label: "본문" },
		{ keywords: ["text"], label: "텍스트" },
		{ keywords: ["photo"], label: "사진" },
		{ keywords: ["image"], label: "이미지" },
	];

	for (const rule of inferRules) {
		if (rule.keywords.every((keyword) => search.includes(keyword))) {
			return rule.label;
		}
	}

	const raw = (field.label || field.name || "").trim();
	if (!raw) {
		return "입력값";
	}

	return raw;
}

function formatFieldExampleHint(description?: string | null): string | null {
	const raw = String(description || "").trim();
	if (!raw) {
		return null;
	}

	if (
		/(x좌표|y좌표|좌표|coordinate|position|offset|너비|높이|width|height)/i.test(
			raw,
		)
	) {
		return null;
	}

	const match = raw.match(/예\s*:\s*([^\n)]+)/);
	if (match && match[1]) {
		return `예: ${match[1].trim()}`;
	}

	return raw;
}

const TEMPLATE_COLOR_PALETTE = [
	"#EF4444",
	"#F97316",
	"#F59E0B",
	"#EAB308",
	"#84CC16",
	"#22C55E",
	"#14B8A6",
	"#06B6D4",
	"#3B82F6",
	"#6366F1",
	"#8B5CF6",
	"#EC4899",
];

function normalizeArgbColor(value: string): string | null {
	const hex = String(value || "").trim();
	if (!hex) {
		return null;
	}

	const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
	if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
		return `#FF${normalized.toUpperCase()}`;
	}
	if (/^[0-9a-fA-F]{8}$/.test(normalized)) {
		return `#${normalized.toUpperCase()}`;
	}

	return null;
}

function argbToCssColor(value: string): string {
	const argb = normalizeArgbColor(value);
	if (!argb) {
		return value;
	}
	const hex = argb.slice(1);
	const aa = hex.slice(0, 2);
	const rrggbb = hex.slice(2);
	return `#${rrggbb}${aa}`;
}

function parseMultiUrlInput(value: string | undefined): string[] {
	const raw = String(value || "").trim();
	if (!raw) {
		return [];
	}

	if (raw.startsWith("[") && raw.endsWith("]")) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed
					.map((item) => String(item || "").trim())
					.filter(Boolean);
			}
		} catch {
			// Fall through to comma-separated parsing.
		}
	}

	return raw
		.split(",")
		.map((item) =>
			item
				.trim()
				.replace(/^\[+/, "")
				.replace(/\]+$/, "")
				.replace(/^"+/, "")
				.replace(/"+$/, ""),
		)
		.filter(Boolean);
}

function hasRequiredFieldValue(
	field: TemplateRequiredInput,
	rawValue: string | undefined,
	pageImageUrl?: string,
): boolean {
	if (isDecorativeLineField(field)) {
		return true;
	}

	if (String(field.defaultValue || "").trim()) {
		return true;
	}

	if (isAutoManagedPagePhotoField(field)) {
		return Boolean(String(pageImageUrl || "").trim());
	}

	if (typeof rawValue !== "string") {
		return false;
	}

	const trimmed = rawValue.trim();
	if (!trimmed) {
		return false;
	}

	const binding = String(field.binding || "").toLowerCase();
	if (binding === "file") {
		return parseMultiUrlInput(rawValue).length > 0;
	}

	const type = String(field.type || "").toLowerCase();
	if (type.includes("array")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed.length > 0;
			}
		} catch {
			// Fallback: comma-separated value should include at least one token.
		}
		return (
			trimmed
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean).length > 0
		);
	}

	return true;
}

function isDecorativeLineField(field: {
	name?: string | null;
	label?: string | null;
	description?: string | null;
}): boolean {
	const search = normalizeTemplateFieldSearch(
		field.name,
		field.label,
		field.description,
	);
	return (
		search.includes("linevertical") ||
		search.includes("line vertical") ||
		search.includes("linehorizontal") ||
		search.includes("line horizontal") ||
		search.includes("구분선") ||
		search.includes("라인")
	);
}

function validatePublishRequirements(params: {
	pages: Page[];
	contentTemplates: ContentTemplateItem[];
}): string | null {
	const orderedPages = [...params.pages].sort(
		(a, b) => a.pageOrder - b.pageOrder || a.id.localeCompare(b.id),
	);
	const missingTemplatePages: number[] = [];

	for (let index = 0; index < orderedPages.length; index++) {
		const page = orderedPages[index];
		const displayPageNumber = index + 1;
		if (!page.contentTemplateUid) {
			missingTemplatePages.push(displayPageNumber);
			continue;
		}

		const template = params.contentTemplates.find(
			(item) => item.templateUid === page.contentTemplateUid,
		);
		if (!template) {
			missingTemplatePages.push(displayPageNumber);
			continue;
		}

		const requiredInputs = (template.requiredInputs || []).filter(
			(field) =>
				!isAutoManagedPagePhotoField(field) &&
				!isAutoManagedBookTitleField(field),
		);
		if (requiredInputs.length === 0) {
			continue;
		}

		const savedValues = toInputValueMap(
			parseOverrides(page.contentTemplateOverrides),
		);
		const missingField = requiredInputs.find(
			(field) =>
				!hasRequiredFieldValue(
					field,
					savedValues[field.name],
					page.imageUrl,
				),
		);

		if (missingField) {
			return `${displayPageNumber}페이지의 ${getFieldDisplayLabel(missingField)} 항목이 비어있습니다!`;
		}
	}

	if (missingTemplatePages.length > 0) {
		return `${missingTemplatePages.join(", ")}페이지의 템플릿을 선택해 주세요!`;
	}

	return null;
}

function getAutoDefaultFieldValue(
	field: TemplateRequiredInput,
	page: Pick<Page, "imageUrl">,
): string {
	const defaultValue = String(field.defaultValue || "").trim();
	if (defaultValue) {
		return defaultValue;
	}

	if (Array.isArray(field.options) && field.options.length > 0) {
		return String(field.options[0]?.value || "").trim();
	}

	if (isPaletteColorField(field)) {
		return normalizeArgbColor(TEMPLATE_COLOR_PALETTE[0]) || "#FFFFFFFF";
	}

	const key = normalizeFieldKey(field.name || "");
	if (isCollagePhotoField(field)) {
		if (page.imageUrl) {
			return [page.imageUrl, page.imageUrl, page.imageUrl].join(",");
		}
		return [
			"https://picsum.photos/seed/momento-collage-1/1200/900",
			"https://picsum.photos/seed/momento-collage-2/1200/900",
			"https://picsum.photos/seed/momento-collage-3/1200/900",
		].join(",");
	}
	if (key.includes("weatherlabel")) return "오늘의 날씨";
	if (key.includes("weathervalue")) return "맑음";
	if (key.includes("meallabel")) return "오늘의 급식";
	if (key.includes("mealvalue")) return "잘 먹음";
	if (key.includes("naplabel")) return "낮잠";
	if (key.includes("napvalue")) return "충분히 잠";

	const binding = String(field.binding || "").toLowerCase();
	if (binding === "file") {
		return (
			page.imageUrl || "https://picsum.photos/seed/momento-dev/1200/900"
		);
	}

	const type = String(field.type || "").toLowerCase();
	if (type.includes("boolean")) return "true";
	if (type.includes("number") || type.includes("integer")) return "1";
	if (type.includes("array")) return "기본값";

	return "기본값";
}

function isPaletteColorField(field: TemplateRequiredInput): boolean {
	const key = normalizeFieldKey(field.name || "");
	return key.includes("pointcolor") || key.includes("monthcolor");
}

function getSuggestedExampleHint(field: TemplateRequiredInput): string | null {
	const key = normalizeFieldKey(field.name || "");

	if (key.includes("weatherlabel")) {
		return "예: 오늘의 날씨, 오늘의 하늘";
	}
	if (key.includes("weathervalue")) {
		return "예: 맑음, 구름 조금, 봄비가 내려요";
	}
	if (key.includes("meallabel")) {
		return "예: 오늘의 급식, 점심 메뉴";
	}
	if (key.includes("mealvalue")) {
		return "예: 소고기미역국, 잡곡밥, 김치 / 맛있게 잘 먹었어요";
	}
	if (key.includes("naplabel")) {
		return "예: 낮잠 시간, 오늘의 낮잠";
	}
	if (key.includes("napvalue")) {
		return "예: 13:00~14:30, 1시간 푹 잤어요";
	}
	if (key.includes("pointcolor") || key.includes("monthcolor")) {
		return "아래 팔레트에서 색상을 선택하세요.";
	}

	return null;
}

function isAutoManagedCoverTemplateField(
	field: TemplateRequiredInput,
): boolean {
	const search = normalizeTemplateFieldSearch(
		field.name,
		field.label,
		field.binding,
	);
	return (
		search.includes("coverphoto") ||
		search.includes("cover photo") ||
		search.includes("frontphoto") ||
		search.includes("front photo")
	);
}

function isCollagePhotoField(field: TemplateRequiredInput): boolean {
	const key = normalizeFieldKey(field.name || "");
	return key.includes("collage");
}

function isAutoManagedPagePhotoField(field: TemplateRequiredInput): boolean {
	const search = normalizeTemplateFieldSearch(
		field.name,
		field.label,
		field.binding,
	);
	return search.includes("photo") && !isCollagePhotoField(field);
}

function isAutoManagedBookTitleField(field: TemplateRequiredInput): boolean {
	const search = normalizeTemplateFieldSearch(
		field.name,
		field.label,
		field.description,
	);

	return (
		search.includes("booktitle") ||
		(search.includes("book") && search.includes("title"))
	);
}

function getOptionImageUrl(option: {
	iconUrl?: string;
	thumbnailUrl?: string;
	previewUrl?: string;
}): string | null {
	for (const candidate of [
		option.iconUrl,
		option.thumbnailUrl,
		option.previewUrl,
	]) {
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.trim();
		}
	}
	return null;
}

function isBalloonLikeField(field: TemplateRequiredInput): boolean {
	const search = normalizeTemplateFieldSearch(
		field.name,
		field.label,
		field.description,
	);
	return search.includes("balloon") || search.includes("말풍선");
}

function parseOverrides(value: unknown): PublishTemplateOverrides | null {
	if (!value) return null;
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as PublishTemplateOverrides;
		} catch {
			return null;
		}
	}
	if (typeof value === "object") {
		return value as PublishTemplateOverrides;
	}
	return null;
}

export default function EditorClient({ initialProject }: Props) {
	const router = useRouter();
	const isDevMode = process.env.NODE_ENV !== "production";
	const pageListScrollRef = useRef<HTMLDivElement>(null);
	const editorScrollRef = useRef<HTMLElement>(null);
	const pendingPageListScrollRef = useRef(false);
	const [project, setProject] = useState<Project>(initialProject);
	const [pages, setPages] = useState<Page[]>(initialProject.pages);
	const [activeTab, setActiveTab] = useState<ActiveTab>("cover");
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [devPublishing, setDevPublishing] = useState(false);
	const [devPublishStageMessage, setDevPublishStageMessage] =
		useState("출판 준비 중...");
	const [message, setMessage] = useState("");
	const [messageType, setMessageType] = useState<"success" | "error">(
		"success",
	);
	const [contentTemplates, setContentTemplates] = useState<
		ContentTemplateItem[]
	>([]);
	const [coverTemplates, setCoverTemplates] = useState<ContentTemplateItem[]>(
		[],
	);
	const [templatesLoading, setTemplatesLoading] = useState(true);
	const [templateLoadError, setTemplateLoadError] = useState("");

	useEffect(() => {
		let active = true;

		async function loadTemplates() {
			try {
				setTemplatesLoading(true);
				setTemplateLoadError("");

				const pageSize = 100;
				let offset = 0;
				let hasNext = true;
				const all: ContentTemplateItem[] = [];

				while (hasNext) {
					const response = await fetch(
						`/api/templates?limit=${pageSize}&offset=${offset}&compatibility=publish`,
					);
					const json = (await response.json()) as {
						success: boolean;
						error?: string;
						data?: {
							templates?: ContentTemplateItem[];
							pagination?: { hasNext?: boolean };
						};
					};

					if (!response.ok || !json.success) {
						throw new Error(
							json.error ||
								"내지 템플릿 목록을 불러오지 못했습니다.",
						);
					}

					all.push(...(json.data?.templates || []));
					hasNext = json.data?.pagination?.hasNext === true;
					offset += pageSize;
					if (offset > 5000) {
						break;
					}
				}

				if (!active) {
					return;
				}

				const filteredBySpec = all.filter(
					(template) => template.bookSpecUid === project.bookSpecUid,
				);
				setCoverTemplates(
					filteredBySpec.filter(
						(template) =>
							String(template.templateKind).toLowerCase() ===
							"cover",
					),
				);
				setContentTemplates(
					filteredBySpec.filter(
						(template) =>
							String(template.templateKind).toLowerCase() ===
							"content",
					),
				);
			} catch (error) {
				if (active) {
					setTemplateLoadError(
						error instanceof Error
							? error.message
							: "템플릿 목록을 불러오지 못했습니다.",
					);
				}
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
	}, [project.bookSpecUid]);

	function showMsg(text: string, type: "success" | "error" = "success") {
		setMessage(text);
		setMessageType(type);
		setTimeout(() => setMessage(""), 3000);
	}

	function scrollPageListToBottom() {
		pendingPageListScrollRef.current = true;
	}

	useEffect(() => {
		const editorEl = editorScrollRef.current;
		if (!editorEl) {
			return;
		}

		editorEl.scrollTop = 0;
	}, [activeTab]);

	useEffect(() => {
		if (!pendingPageListScrollRef.current) {
			return;
		}

		pendingPageListScrollRef.current = false;
		let frameCount = 0;

		const settleAndScroll = () => {
			const listEl = pageListScrollRef.current;
			if (!listEl) {
				return;
			}

			listEl.scrollTop = listEl.scrollHeight;
			frameCount += 1;

			// Consecutive add clicks can delay layout; scroll for a few frames to settle.
			if (frameCount < 3) {
				requestAnimationFrame(settleAndScroll);
			}
		};

		requestAnimationFrame(settleAndScroll);
	}, [pages.length]);

	/* ─── 표지 저장 ─── */
	async function saveCover(
		coverImageUrl: string,
		coverCaption: string,
		coverTemplateUid?: string,
		coverTemplateOverrides?: PublishTemplateOverrides,
	) {
		setSaving(true);
		try {
			const existingCoverOverrides =
				(project.coverTemplateOverrides as PublishTemplateOverrides | null) ||
				undefined;
			const res = await fetch(`/api/projects/${project.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					coverImageUrl,
					coverCaption,
					coverTemplateUid,
					coverTemplateOverrides:
						coverTemplateOverrides ||
						existingCoverOverrides ||
						null,
				}),
			});
			const json = await res.json();
			if (res.ok) {
				setProject((p) => ({
					...p,
					coverImageUrl,
					coverCaption,
					coverTemplateUid: coverTemplateUid || p.coverTemplateUid,
					coverTemplateOverrides:
						coverTemplateOverrides ||
						(p.coverTemplateOverrides as PublishTemplateOverrides | null),
				}));
				showMsg("표지가 저장되었습니다.");
			} else {
				const errorMsg = json?.error || "표지 저장에 실패했습니다.";
				showMsg(errorMsg, "error");
			}
		} catch (err: unknown) {
			const errorMsg =
				err instanceof Error ? err.message : "표지 저장 중 오류 발생";
			showMsg(errorMsg, "error");
		} finally {
			setSaving(false);
		}
	}

	/* ─── 페이지 추가 ─── */
	async function addPage() {
		const res = await fetch(`/api/projects/${project.id}/pages`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				imageUrl: `https://picsum.photos/seed/${Math.random().toString(36).slice(2)}/800/600`,
				caption: "",
				pageOrder: pages.length + 1,
			}),
		});
		const json = await res.json();
		if (res.ok) {
			const newPage = json.data as Page;
			setPages((prev) => [...prev, newPage]);
			setActiveTab(newPage.id);
			scrollPageListToBottom();
		}
	}

	/* ─── 페이지 저장 ─── */
	async function savePage(
		pageId: string,
		imageUrl: string,
		caption: string,
		contentTemplateUid?: string,
		contentTemplateOverrides?: PublishTemplateOverrides,
		saveOptions?: { silent?: boolean },
	): Promise<boolean> {
		setSaving(true);
		try {
			const res = await fetch(
				`/api/projects/${project.id}/pages/${pageId}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						imageUrl,
						caption,
						contentTemplateUid,
						contentTemplateOverrides,
					}),
				},
			);
			const json = await res.json();
			if (res.ok) {
				setPages((prev) =>
					prev.map((pg) =>
						pg.id === pageId
							? {
									...pg,
									imageUrl,
									caption,
									contentTemplateUid:
										contentTemplateUid || null,
									contentTemplateOverrides:
										contentTemplateOverrides || null,
								}
							: pg,
					),
				);
				if (!saveOptions?.silent) {
					showMsg("페이지가 저장되었습니다.");
				}
				return true;
			} else {
				const errorMsg = json?.error || "페이지 저장에 실패했습니다.";
				showMsg(errorMsg, "error");
				return false;
			}
		} catch (err: unknown) {
			const errorMsg =
				err instanceof Error ? err.message : "페이지 저장 중 오류 발생";
			showMsg(errorMsg, "error");
			return false;
		} finally {
			setSaving(false);
		}
	}

	/* ─── 페이지 삭제 ─── */
	async function deletePage(pageId: string) {
		if (!confirm("이 페이지를 삭제할까요?")) return;
		const res = await fetch(`/api/projects/${project.id}/pages/${pageId}`, {
			method: "DELETE",
		});
		if (res.ok) {
			const remaining = pages.filter((p) => p.id !== pageId);
			setPages(remaining);
			setActiveTab(remaining.length > 0 ? remaining[0].id : "cover");
		}
	}

	/* ─── 페이지 순서 이동 ─── */
	async function movePage(pageId: string, direction: "up" | "down") {
		const idx = pages.findIndex((p) => p.id === pageId);
		if (direction === "up" && idx === 0) return;
		if (direction === "down" && idx === pages.length - 1) return;

		const newPages = [...pages];
		const swapIdx = direction === "up" ? idx - 1 : idx + 1;
		[newPages[idx], newPages[swapIdx]] = [newPages[swapIdx], newPages[idx]];

		// pageOrder 재정렬
		const reordered = newPages.map((p, i) => ({ ...p, pageOrder: i + 1 }));
		setPages(reordered);

		await fetch(`/api/projects/${project.id}/pages/reorder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ order: reordered.map((p) => p.id) }),
		});
	}

	async function runPublishRequest() {
		setPublishing(true);
		try {
			if (devPublishing) {
				setDevPublishStageMessage("출판 요청을 전송하는 중...");
			}
			const basePublishBody =
				project.coverTemplateOverrides ||
				project.contentTemplateOverrides
					? {
							coverOverrides:
								(project.coverTemplateOverrides as PublishTemplateOverrides | null) ||
								undefined,
							contentOverrides:
								(project.contentTemplateOverrides as PublishTemplateOverrides | null) ||
								undefined,
						}
					: undefined;
			const res = await fetch(`/api/projects/${project.id}/publish`, {
				method: "POST",
				headers: basePublishBody
					? { "Content-Type": "application/json" }
					: undefined,
				body: basePublishBody
					? JSON.stringify(basePublishBody)
					: undefined,
			});
			if (devPublishing) {
				setDevPublishStageMessage("출판 결과를 확인하는 중...");
			}
			const json = (await res.json()) as PublishErrorPayload;

			if (!res.ok) throw new Error(json.error || "출판 실패");
			const estimatedTotal = Number(json?.estimate?.totalPrice);
			const hasRealEstimate = Number.isFinite(estimatedTotal);
			showMsg(
				hasRealEstimate
					? `출판 완료! 실제 샌드박스 견적 ${estimatedTotal.toLocaleString("ko-KR")}원 기준으로 주문 페이지로 이동합니다.`
					: "출판이 완료되었습니다! 주문 페이지로 이동합니다.",
			);
			setTimeout(() => router.push(`/order/${project.id}`), 1200);
		} catch (err: unknown) {
			showMsg(
				err instanceof Error ? err.message : "출판 중 오류 발생",
				"error",
			);
		} finally {
			setPublishing(false);
		}
	}

	/* ─── 출판하기 ─── */
	async function handlePublish() {
		if (pages.length === 0) {
			showMsg("최소 1페이지 이상 추가해 주세요.", "error");
			return;
		}
		if (templatesLoading) {
			showMsg(
				"템플릿 목록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.",
				"error",
			);
			return;
		}
		if (!project.coverImageUrl) {
			showMsg("표지 이미지를 설정해 주세요.", "error");
			return;
		}
		if (!project.coverTemplateUid) {
			showMsg("표지 템플릿을 먼저 선택하고 저장해 주세요.", "error");
			return;
		}
		const publishValidationError = validatePublishRequirements({
			pages,
			contentTemplates,
		});
		if (publishValidationError) {
			showMsg(publishValidationError, "error");
			return;
		}
		await runPublishRequest();
	}

	async function handleDevPublishWithDefaults() {
		if (!isDevMode) {
			return;
		}
		if (pages.length === 0) {
			showMsg("최소 1페이지 이상 추가해 주세요.", "error");
			return;
		}
		if (templatesLoading) {
			showMsg(
				"템플릿 목록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.",
				"error",
			);
			return;
		}
		if (!project.coverImageUrl) {
			showMsg("표지 이미지를 설정해 주세요.", "error");
			return;
		}
		if (!project.coverTemplateUid) {
			showMsg("표지 템플릿을 먼저 선택하고 저장해 주세요.", "error");
			return;
		}
		if (contentTemplates.length === 0) {
			showMsg(
				"내지 템플릿이 없어 기본값 자동 출판을 진행할 수 없습니다.",
				"error",
			);
			return;
		}

		setDevPublishing(true);
		try {
			setDevPublishStageMessage("기본값 자동 채우기를 시작하는 중...");
			const fallbackTemplate =
				contentTemplates.find(
					(template) =>
						template.templateUid === project.contentTemplateUid,
				) || contentTemplates[0];

			for (let index = 0; index < pages.length; index++) {
				const page = pages[index];
				setDevPublishStageMessage(
					`${index + 1}/${pages.length} 페이지 기본값을 저장하는 중...`,
				);
				const selectedTemplate =
					contentTemplates.find(
						(template) =>
							template.templateUid === page.contentTemplateUid,
					) || fallbackTemplate;

				if (!selectedTemplate) {
					showMsg(
						"자동 기본값 채움 중 템플릿을 찾지 못했습니다.",
						"error",
					);
					return;
				}

				const fields = (selectedTemplate.requiredInputs || []).filter(
					(field) =>
						!isAutoManagedPagePhotoField(field) &&
						!isAutoManagedBookTitleField(field),
				);
				const savedValues = toInputValueMap(
					parseOverrides(page.contentTemplateOverrides),
				);
				const nextValues = { ...savedValues };

				for (const field of fields) {
					if (
						hasRequiredFieldValue(
							field,
							nextValues[field.name],
							page.imageUrl,
						)
					) {
						continue;
					}

					if (isDecorativeLineField(field)) {
						continue;
					}

					nextValues[field.name] = getAutoDefaultFieldValue(
						field,
						page,
					);
				}

				const overrides = withTemplateFingerprint(
					buildTemplateOverrides({
						fields,
						values: nextValues,
					}),
					selectedTemplate,
				);

				const saved = await savePage(
					page.id,
					page.imageUrl,
					page.caption,
					selectedTemplate.templateUid,
					overrides,
					{ silent: true },
				);

				if (!saved) {
					showMsg(
						"자동 기본값 저장 중 오류가 발생했습니다.",
						"error",
					);
					return;
				}
			}

			setDevPublishStageMessage("출판을 시작하는 중...");
			await runPublishRequest();
		} finally {
			setDevPublishing(false);
			setDevPublishStageMessage("출판 준비 중...");
		}
	}

	const activePage = pages.find((p) => p.id === activeTab);

	if (devPublishing) {
		return (
			<div className="h-screen w-full bg-gray-50 flex items-center justify-center">
				<div className="flex flex-col items-center gap-6">
					<div className="relative">
						<div className="w-28 h-28 rounded-full border-8 border-slate-200" />
						<div className="absolute inset-0 w-28 h-28 rounded-full border-8 border-transparent border-t-blue-500 animate-spin" />
					</div>
					<p className="text-2xl font-bold text-slate-700 tracking-tight">
						출판 처리중...
					</p>
					<p className="text-sm text-slate-500">
						{devPublishStageMessage}
					</p>
				</div>
			</div>
		);
	}

	if (activeTab === "cover" && templatesLoading) {
		return (
			<div className="h-screen w-full bg-gray-50 flex items-center justify-center">
				<div className="flex flex-col items-center gap-6">
					<div className="relative">
						<div className="w-28 h-28 rounded-full border-8 border-slate-200" />
						<div className="absolute inset-0 w-28 h-28 rounded-full border-8 border-transparent border-t-blue-500 animate-spin" />
					</div>
					<p className="text-2xl font-bold text-slate-700 tracking-tight">
						표지 템플릿 로딩중...
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen bg-gray-50">
			{/* ─── 헤더 ─── */}
			<header className="bg-white border-b border-rose-100 px-6 py-3 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<a
						href="/"
						className="text-rose-400 text-sm hover:underline"
					>
						← 홈
					</a>
					<span className="text-gray-300">/</span>
					<span className="font-semibold text-gray-800 text-sm truncate max-w-xs">
						{project.title}
					</span>
					<span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
						{pages.length}페이지
					</span>
				</div>
				<div className="flex items-center gap-3">
					{saving && (
						<span className="text-gray-400 text-xs">
							저장 중...
						</span>
					)}
					{isDevMode && (
						<button
							onClick={handleDevPublishWithDefaults}
							disabled={publishing || saving}
							className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
						>
							{publishing
								? "출판 중..."
								: "DEV: 기본값으로 출판 & 주문하기"}
						</button>
					)}
					<button
						onClick={handlePublish}
						disabled={publishing || saving}
						className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
					>
						{publishing ? "출판 중..." : "📖 출판 & 주문하기"}
					</button>
				</div>
			</header>

			{/* ─── 알림 메시지 ─── */}
			{message && (
				<div
					className={`px-6 py-2.5 text-sm text-white text-center ${
						messageType === "success"
							? "bg-emerald-500"
							: "bg-red-500"
					}`}
				>
					{message}
				</div>
			)}

			<div className="flex flex-1 overflow-hidden">
				{/* ─── 왼쪽 사이드바 ─── */}
				<aside className="w-56 bg-white border-r border-rose-100 flex flex-col overflow-hidden">
					{/* 표지 */}
					<button
						onClick={() => setActiveTab("cover")}
						className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-b border-rose-50 ${
							activeTab === "cover"
								? "bg-rose-50 text-rose-600 border-l-2 border-l-rose-500"
								: "text-gray-600 hover:bg-gray-50"
						}`}
					>
						<div className="w-10 h-10 rounded-md overflow-hidden bg-rose-50 flex-shrink-0">
							{project.coverImageUrl ? (
								<Image
									src={project.coverImageUrl}
									alt="표지"
									width={40}
									height={40}
									className="object-cover w-full h-full"
									unoptimized
								/>
							) : (
								<div className="w-full h-full flex items-center justify-center text-rose-300 text-lg">
									♡
								</div>
							)}
						</div>
						<span>표지</span>
					</button>
					<div
						ref={pageListScrollRef}
						className="flex-1 overflow-y-auto"
					>
						{pages.map((page, idx) => (
							<div key={page.id} className="relative group">
								<button
									onClick={() => setActiveTab(page.id)}
									className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
										activeTab === page.id
											? "bg-rose-50 text-rose-600 border-l-2 border-l-rose-500"
											: "text-gray-600 hover:bg-gray-50"
									}`}
								>
									<div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
										<Image
											src={page.imageUrl}
											alt={`페이지 ${idx + 1}`}
											width={40}
											height={40}
											className="object-cover w-full h-full"
											unoptimized
										/>
									</div>
									<span className="truncate">
										{idx + 1}p{" "}
										{page.caption
											? `· ${page.caption.slice(0, 10)}…`
											: ""}
									</span>
								</button>
								{/* 순서 이동 버튼 */}
								<div className="absolute right-1 top-1 hidden group-hover:flex flex-col gap-0.5">
									<button
										onClick={() => movePage(page.id, "up")}
										className="text-xs text-gray-400 hover:text-rose-500 leading-none"
										title="위로"
									>
										▲
									</button>
									<button
										onClick={() =>
											movePage(page.id, "down")
										}
										className="text-xs text-gray-400 hover:text-rose-500 leading-none"
										title="아래로"
									>
										▼
									</button>
								</div>
							</div>
						))}
					</div>

					{/* 페이지 추가 */}
					<div className="p-3 border-t border-rose-100 bg-white shrink-0">
						<button
							onClick={addPage}
							className="w-full border-2 border-dashed border-rose-200 hover:border-rose-400 text-rose-400 hover:text-rose-500 text-sm py-2.5 rounded-lg transition-colors"
						>
							+ 페이지 추가
						</button>
					</div>
				</aside>

				{/* ─── 오른쪽 에디터 영역 ─── */}
				<main
					ref={editorScrollRef}
					className="flex-1 overflow-y-auto p-8"
				>
					{activeTab === "cover" ? (
						<CoverPanel
							project={project}
							onSave={saveCover}
							coverTemplates={coverTemplates}
							templatesLoading={templatesLoading}
							templateLoadError={templateLoadError}
						/>
					) : activePage ? (
						<PagePanel
							page={activePage}
							pageIndex={pages.findIndex(
								(p) => p.id === activePage.id,
							)}
							onSave={savePage}
							onDelete={deletePage}
							contentTemplates={contentTemplates}
							templatesLoading={templatesLoading}
							templateLoadError={templateLoadError}
						/>
					) : null}
				</main>
			</div>
		</div>
	);
}

/* ─────────────────────────────────────────────────────────── */
/* 표지 편집 패널                                                 */
/* ─────────────────────────────────────────────────────────── */
function CoverPanel({
	project,
	onSave,
	coverTemplates,
	templatesLoading,
	templateLoadError,
}: {
	project: Project;
	onSave: (
		imageUrl: string,
		caption: string,
		coverTemplateUid?: string,
		coverTemplateOverrides?: PublishTemplateOverrides,
	) => void;
	coverTemplates: ContentTemplateItem[];
	templatesLoading: boolean;
	templateLoadError: string;
}) {
	const [imageUrl, setImageUrl] = useState(project.coverImageUrl || "");
	const [caption, setCaption] = useState(project.coverCaption || "");
	const [coverTemplateUid, setCoverTemplateUid] = useState(
		project.coverTemplateUid || "",
	);
	const [templateInputValuesByUid, setTemplateInputValuesByUid] = useState<
		Record<string, Record<string, string>>
	>({});
	const [templateInputError, setTemplateInputError] = useState("");
	const [uploading, setUploading] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const selectedTemplate =
		coverTemplates.find(
			(template) => template.templateUid === coverTemplateUid,
		) || null;
	const requiredInputs = (selectedTemplate?.requiredInputs || []).filter(
		(field) =>
			!isAutoManagedCoverTemplateField(field) &&
			!isAutoManagedBookTitleField(field),
	);
	const selectedTemplateValues =
		templateInputValuesByUid[coverTemplateUid] || {};
	const isSavedTemplateUnavailable =
		Boolean(coverTemplateUid) && selectedTemplate === null;

	useEffect(() => {
		if (
			!coverTemplateUid ||
			selectedTemplate ||
			coverTemplates.length === 0
		) {
			return;
		}

		const parsed = parseOverrides(project.coverTemplateOverrides);
		const fingerprint = getTemplateFingerprintFromOverrides(parsed);
		if (!fingerprint) {
			return;
		}

		const matched = coverTemplates.find(
			(template) => buildTemplateFingerprint(template) === fingerprint,
		);
		if (!matched) {
			return;
		}

		setCoverTemplateUid(matched.templateUid);
		setTemplateInputValuesByUid((prev) => ({
			...prev,
			[matched.templateUid]:
				prev[coverTemplateUid] || toInputValueMap(parsed),
		}));
	}, [
		coverTemplateUid,
		selectedTemplate,
		coverTemplates,
		project.coverTemplateOverrides,
	]);

	useEffect(() => {
		setImageUrl(project.coverImageUrl || "");
		setCaption(project.coverCaption || "");
		const savedUid = project.coverTemplateUid || "";
		setCoverTemplateUid(savedUid);
		setTemplateInputError("");
		if (!savedUid) {
			setTemplateInputValuesByUid({});
			return;
		}
		const parsed = parseOverrides(project.coverTemplateOverrides);
		setTemplateInputValuesByUid((prev) => ({
			...prev,
			[savedUid]: toInputValueMap(parsed),
		}));
	}, [
		project.coverImageUrl,
		project.coverCaption,
		project.coverTemplateUid,
		project.coverTemplateOverrides,
	]);

	useEffect(() => {
		if (
			coverTemplates.length > 0 &&
			!coverTemplateUid &&
			!project.coverTemplateUid
		) {
			setCoverTemplateUid(coverTemplates[0].templateUid);
		}
	}, [coverTemplateUid, coverTemplates, project.coverTemplateUid]);

	async function handleFile(file: File) {
		setUploading(true);
		const fd = new FormData();
		fd.append("file", file);
		fd.append("type", "cover");
		fd.append("projectId", project.id);
		const res = await fetch("/api/upload", { method: "POST", body: fd });
		const json = await res.json();
		setUploading(false);
		if (res.ok) setImageUrl(json.url);
	}

	return (
		<div className="max-w-2xl mx-auto">
			<h2 className="text-xl font-bold text-gray-800 mb-6">표지 편집</h2>

			<div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold text-slate-800">
						표지 템플릿 먼저 선택
					</p>
					{templatesLoading && (
						<span className="text-xs text-slate-500">
							불러오는 중...
						</span>
					)}
				</div>
				{templateLoadError && (
					<p className="text-xs text-amber-700">
						{templateLoadError}
					</p>
				)}
				{isSavedTemplateUnavailable && (
					<p className="text-xs text-amber-700">
						이전에 저장한 표지 템플릿을 현재 목록에서 찾을 수
						없습니다. 새 템플릿을 선택한 뒤 다시 저장해 주세요.
					</p>
				)}

				{coverTemplates.length > 0 && (
					<div className="space-y-3">
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
							{coverTemplates.map((template) => {
								const selected =
									template.templateUid === coverTemplateUid;
								return (
									<button
										type="button"
										key={template.templateUid}
										onClick={() => {
											setTemplateInputError("");
											setCoverTemplateUid(
												template.templateUid,
											);
										}}
										className={`text-left rounded-xl border overflow-hidden transition-all ${
											selected
												? "border-rose-400 ring-2 ring-rose-200 bg-rose-50"
												: "border-slate-200 bg-white hover:border-rose-200"
										}`}
									>
										<div className="bg-slate-100 overflow-hidden border-b border-slate-100">
											{template.thumbnails?.layout ? (
												<img
													src={
														template.thumbnails
															.layout
													}
													alt={template.templateName}
													className="block w-full h-auto object-contain"
												/>
											) : (
												<div className="w-full min-h-32 flex items-center justify-center text-[11px] text-slate-400">
													미리보기 없음
												</div>
											)}
										</div>
										<div className="p-2">
											<p className="text-xs font-semibold text-slate-800 line-clamp-2">
												{template.templateName}
											</p>
										</div>
									</button>
								);
							})}
						</div>

						{selectedTemplate && (
							<div className="rounded-xl border border-slate-200 bg-white p-3">
								<p className="text-xs font-semibold text-slate-700 mb-2">
									선택 템플릿 실시간 미리보기
								</p>
								<div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
									{selectedTemplate.thumbnails?.layout ? (
										<img
											src={
												selectedTemplate.thumbnails
													.layout
											}
											alt={selectedTemplate.templateName}
											className="block w-full h-auto object-contain"
										/>
									) : (
										<div className="w-full min-h-40 flex items-center justify-center text-sm text-slate-400">
											템플릿 미리보기가 없습니다.
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* 이미지 프리뷰 */}
			<div
				className="relative w-full aspect-[4/3] bg-rose-50 rounded-2xl border-2 border-dashed border-rose-200 overflow-hidden mb-5 cursor-pointer upload-zone group"
				onClick={() => fileRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					e.currentTarget.classList.add("drag-over");
				}}
				onDragLeave={(e) =>
					e.currentTarget.classList.remove("drag-over")
				}
				onDrop={async (e) => {
					e.preventDefault();
					e.currentTarget.classList.remove("drag-over");
					const file = e.dataTransfer.files[0];
					if (file) await handleFile(file);
				}}
			>
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt="표지"
						fill
						className="object-cover"
						unoptimized
					/>
				) : (
					<div className="absolute inset-0 flex flex-col items-center justify-center text-rose-300">
						<span className="text-4xl mb-2">📷</span>
						<span className="text-sm">
							표지 사진을 선택해주세요
						</span>
					</div>
				)}
				{uploading && (
					<div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-sm">
						업로드 중...
					</div>
				)}
				{imageUrl && (
					<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
						<span className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
							사진 변경
						</span>
					</div>
				)}
			</div>

			<input
				ref={fileRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={async (e) => {
					const file = e.target.files?.[0];
					if (file) await handleFile(file);
				}}
			/>

			{/* URL 직접 입력 */}
			<div className="grid grid-cols-[1fr,auto] gap-2 mb-4">
				<input
					type="url"
					placeholder="또는 이미지 URL을 직접 입력하세요"
					value={imageUrl}
					onChange={(e) => setImageUrl(e.target.value)}
					className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
				/>
				<button
					onClick={() => {
						if (imageUrl.trim()) onSave(imageUrl.trim(), caption);
					}}
					className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition-colors"
				>
					미리보기
				</button>
			</div>

			{/* 표지 문구 */}
			<div className="mb-3">
				<label className="block text-xs font-semibold text-slate-700 mb-1">
					표지 문구
				</label>
				<input
					type="text"
					placeholder="값을 입력하세요"
					value={caption}
					onChange={(e) => setCaption(e.target.value)}
					className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
				/>
				<p className="text-[11px] text-slate-500 mt-1">
					예: 우리의 봄날 기록
				</p>
			</div>

			{selectedTemplate && (
				<div className="mb-6 space-y-3">
					{requiredInputs.length === 0 ? (
						<p className="text-xs text-emerald-700">
							이 템플릿은 필수 추가 입력값이 없습니다.
						</p>
					) : (
						requiredInputs.map((field) => {
							const binding = String(
								field.binding || "",
							).toLowerCase();
							const displayLabel = getFieldDisplayLabel(field);
							const exampleHint =
								getSuggestedExampleHint(field) ||
								formatFieldExampleHint(field.description);
							const isPaletteField = isPaletteColorField(field);
							const isDecorativeLine =
								isDecorativeLineField(field);
							const optionItems = field.options || [];
							const hasOptionIcons = optionItems.some((option) =>
								Boolean(getOptionImageUrl(option)),
							);
							const hasDefaultValue = Boolean(
								String(field.defaultValue || "").trim(),
							);
							const placeholder =
								binding === "file"
									? "파일 URL 입력 (여러 개는 콤마로 구분)"
									: "값을 입력하세요";
							const selectedColorRaw =
								selectedTemplateValues[field.name] || "";
							const selectedColor =
								normalizeArgbColor(selectedColorRaw) || "";

							if (isPaletteField) {
								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-2">
											{displayLabel}
										</label>
										<div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
											{TEMPLATE_COLOR_PALETTE.map(
												(color) => {
													const argbColor =
														normalizeArgbColor(
															color,
														) || "#FFFFFFFF";
													const selected =
														selectedColor.toLowerCase() ===
														argbColor.toLowerCase();
													return (
														<button
															type="button"
															key={argbColor}
															onClick={() =>
																setTemplateInputValuesByUid(
																	(prev) => ({
																		...prev,
																		[coverTemplateUid]:
																			{
																				...(prev[
																					coverTemplateUid
																				] ||
																					{}),
																				[field.name]:
																					argbColor,
																			},
																	}),
																)
															}
															className={`h-8 rounded-md border ${selected ? "ring-2 ring-offset-1 ring-blue-500 border-blue-500" : "border-slate-300"}`}
															style={{
																backgroundColor:
																	argbToCssColor(
																		argbColor,
																	),
															}}
															aria-label={`${displayLabel} ${argbColor}`}
														/>
													);
												},
											)}
										</div>
										<p className="text-[11px] text-slate-500 mt-1">
											선택 값:{" "}
											{selectedColor || "선택 안됨"}
										</p>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							if (
								optionItems.length > 0 &&
								isBalloonLikeField(field) &&
								hasOptionIcons
							) {
								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-2">
											{displayLabel}
										</label>
										<div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
											{optionItems.map((option) => {
												const iconUrl =
													getOptionImageUrl(option);
												const selected =
													(selectedTemplateValues[
														field.name
													] || "") === option.value;

												return (
													<button
														type="button"
														key={`${field.name}-${option.value}`}
														onClick={() =>
															setTemplateInputValuesByUid(
																(prev) => ({
																	...prev,
																	[coverTemplateUid]:
																		{
																			...(prev[
																				coverTemplateUid
																			] ||
																				{}),
																			[field.name]:
																				option.value,
																		},
																}),
															)
														}
														className={`rounded-lg border p-2 bg-white text-left transition-colors ${selected ? "ring-2 ring-offset-1 ring-blue-500 border-blue-500" : "border-slate-200 hover:border-rose-300"}`}
													>
														{iconUrl ? (
															<img
																src={iconUrl}
																alt={
																	option.label
																}
																className="w-full h-16 object-contain rounded bg-slate-50"
															/>
														) : null}
														<p className="text-[11px] text-slate-700 mt-1 line-clamp-2">
															{option.label}
														</p>
													</button>
												);
											})}
										</div>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							if (optionItems.length > 0) {
								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-1">
											{displayLabel}
										</label>
										<select
											value={
												selectedTemplateValues[
													field.name
												] || ""
											}
											onChange={(event) =>
												setTemplateInputValuesByUid(
													(prev) => ({
														...prev,
														[coverTemplateUid]: {
															...(prev[
																coverTemplateUid
															] || {}),
															[field.name]:
																event.target
																	.value,
														},
													}),
												)
											}
											className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
										>
											<option value="">
												선택해 주세요
											</option>
											{optionItems.map((option) => (
												<option
													key={`${field.name}-${option.value}`}
													value={option.value}
												>
													{option.label}
												</option>
											))}
										</select>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							if (hasDefaultValue) {
								return (
									<div
										key={field.name}
										className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
									>
										<p className="text-xs font-semibold text-slate-700">
											{displayLabel}
										</p>
										<p className="text-[11px] text-slate-500 mt-1">
											기본값이 자동 적용됩니다.
										</p>
									</div>
								);
							}

							if (isDecorativeLine) {
								return null;
							}

							return (
								<div key={field.name}>
									<label className="block text-xs font-semibold text-slate-700 mb-1">
										{displayLabel}
									</label>
									<input
										type="text"
										value={
											selectedTemplateValues[
												field.name
											] || ""
										}
										onChange={(event) =>
											setTemplateInputValuesByUid(
												(prev) => ({
													...prev,
													[coverTemplateUid]: {
														...(prev[
															coverTemplateUid
														] || {}),
														[field.name]:
															event.target.value,
													},
												}),
											)
										}
										placeholder={placeholder}
										className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
									/>
									{exampleHint && (
										<p className="text-[11px] text-slate-500 mt-1">
											{exampleHint}
										</p>
									)}
								</div>
							);
						})
					)}
				</div>
			)}

			{templateInputError && (
				<div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{templateInputError}
				</div>
			)}

			<button
				onClick={() => {
					if (!coverTemplateUid) {
						setTemplateInputError(
							"표지에 사용할 템플릿을 선택해 주세요.",
						);
						return;
					}
					if (!selectedTemplate) {
						setTemplateInputError(
							"저장된 템플릿이 현재 목록에 없습니다. 새 템플릿을 선택해 주세요.",
						);
						return;
					}

					const missingField = requiredInputs.find((field) => {
						const value = selectedTemplateValues[field.name];
						return !hasRequiredFieldValue(field, value, imageUrl);
					});
					if (missingField) {
						setTemplateInputError(
							`필수 입력값을 확인해 주세요: ${missingField.label || missingField.name}`,
						);
						return;
					}

					setTemplateInputError("");
					const overrides = withTemplateFingerprint(
						buildTemplateOverrides({
							fields: requiredInputs,
							values: selectedTemplateValues,
						}),
						selectedTemplate,
					);
					onSave(imageUrl, caption, coverTemplateUid, overrides);
				}}
				className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition-colors"
			>
				표지 저장
			</button>
		</div>
	);
}

/* ─────────────────────────────────────────────────────────── */
/* 페이지 편집 패널                                               */
/* ─────────────────────────────────────────────────────────── */
function PagePanel({
	page,
	pageIndex,
	onSave,
	onDelete,
	contentTemplates,
	templatesLoading,
	templateLoadError,
}: {
	page: Page;
	pageIndex: number;
	onSave: (
		id: string,
		imageUrl: string,
		caption: string,
		contentTemplateUid?: string,
		contentTemplateOverrides?: PublishTemplateOverrides,
		saveOptions?: { silent?: boolean },
	) => void;
	onDelete: (id: string) => void;
	contentTemplates: ContentTemplateItem[];
	templatesLoading: boolean;
	templateLoadError: string;
}) {
	const [imageUrl, setImageUrl] = useState(page.imageUrl);
	const [caption, setCaption] = useState(page.caption);
	const [contentTemplateUid, setContentTemplateUid] = useState(
		page.contentTemplateUid || "",
	);
	const [templateInputValuesByUid, setTemplateInputValuesByUid] = useState<
		Record<string, Record<string, string>>
	>({});
	const [templateInputError, setTemplateInputError] = useState("");
	const [uploading, setUploading] = useState(false);
	const [collageFilesByFieldName, setCollageFilesByFieldName] = useState<
		Record<string, File[]>
	>({});
	const fileRef = useRef<HTMLInputElement>(null);
	const collageFileInputRef = useRef<HTMLInputElement>(null);
	const selectedTemplate =
		contentTemplates.find(
			(template) => template.templateUid === contentTemplateUid,
		) || null;
	const templateRequiredInputs = selectedTemplate?.requiredInputs || [];
	const requiredInputs = templateRequiredInputs.filter(
		(field) =>
			!isAutoManagedPagePhotoField(field) &&
			!isAutoManagedBookTitleField(field),
	);
	const collagePhotoFields = templateRequiredInputs.filter((field) =>
		isCollagePhotoField(field),
	);
	const hasCollagePhotoField = collagePhotoFields.length > 0;
	const hasAutoPhotoField = templateRequiredInputs.some(
		isAutoManagedPagePhotoField,
	);
	const selectedTemplateValues =
		templateInputValuesByUid[contentTemplateUid] || {};
	const isSavedTemplateUnavailable =
		Boolean(contentTemplateUid) && selectedTemplate === null;

	useEffect(() => {
		if (
			!contentTemplateUid ||
			selectedTemplate ||
			contentTemplates.length === 0
		) {
			return;
		}

		const parsed = parseOverrides(page.contentTemplateOverrides);
		const fingerprint = getTemplateFingerprintFromOverrides(parsed);
		if (!fingerprint) {
			return;
		}

		const matched = contentTemplates.find(
			(template) => buildTemplateFingerprint(template) === fingerprint,
		);
		if (!matched) {
			return;
		}

		setContentTemplateUid(matched.templateUid);
		setTemplateInputValuesByUid((prev) => ({
			...prev,
			[matched.templateUid]:
				prev[contentTemplateUid] || toInputValueMap(parsed),
		}));
	}, [
		contentTemplateUid,
		selectedTemplate,
		contentTemplates,
		page.contentTemplateOverrides,
	]);

	useEffect(() => {
		setImageUrl(page.imageUrl);
		setCaption(page.caption);
		const pageTemplateUid = page.contentTemplateUid || "";
		setContentTemplateUid(pageTemplateUid);
		setTemplateInputError("");
		if (!pageTemplateUid) {
			setTemplateInputValuesByUid({});
			return;
		}
		const parsed = parseOverrides(page.contentTemplateOverrides);
		setTemplateInputValuesByUid((prev) => ({
			...prev,
			[pageTemplateUid]: toInputValueMap(parsed),
		}));
	}, [
		page.id,
		page.imageUrl,
		page.caption,
		page.contentTemplateUid,
		page.contentTemplateOverrides,
	]);

	async function handleFile(file: File) {
		setUploading(true);
		const fd = new FormData();
		fd.append("file", file);
		fd.append("type", "page");
		fd.append("projectId", page.projectId);
		const res = await fetch("/api/upload", { method: "POST", body: fd });
		const json = await res.json();
		setUploading(false);
		if (res.ok) setImageUrl(json.url);
	}

	async function handleCollageFiles(
		files: FileList | null,
		fieldName: string,
	) {
		if (!files || files.length === 0) return;

		setUploading(true);
		const uploadedUrls: string[] = [];

		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const fd = new FormData();
				fd.append("file", file);
				fd.append("type", "page");
				fd.append("projectId", page.projectId);
				const res = await fetch("/api/upload", {
					method: "POST",
					body: fd,
				});
				const json = await res.json();
				if (res.ok) {
					uploadedUrls.push(json.url);
				}
			}

			if (uploadedUrls.length > 0) {
				setTemplateInputValuesByUid((prev) => ({
					...prev,
					[contentTemplateUid]: {
						...(prev[contentTemplateUid] || {}),
						[fieldName]: uploadedUrls.join(", "),
					},
				}));
				setCollageFilesByFieldName((prev) => ({
					...prev,
					[fieldName]: Array.from(files),
				}));
			}
		} finally {
			setUploading(false);
		}
	}

	return (
		<div key={page.id} className="max-w-2xl mx-auto">
			<div className="flex items-center justify-between mb-6">
				<h2 className="text-xl font-bold text-gray-800">
					{pageIndex + 1}페이지 편집
				</h2>
				<button
					onClick={() => onDelete(page.id)}
					className="text-sm text-red-400 hover:text-red-600 transition-colors"
				>
					🗑 삭제
				</button>
			</div>

			<div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold text-slate-800">
						페이지 템플릿 먼저 선택
					</p>
					{templatesLoading && (
						<span className="text-xs text-slate-500">
							불러오는 중...
						</span>
					)}
				</div>
				{templateLoadError && (
					<p className="text-xs text-amber-700">
						{templateLoadError}
					</p>
				)}
				{isSavedTemplateUnavailable && (
					<p className="text-xs text-amber-700">
						이전에 저장한 페이지 템플릿을 현재 목록에서 찾을 수
						없습니다. 새 템플릿을 선택한 뒤 다시 저장해 주세요.
					</p>
				)}

				{contentTemplates.length > 0 && (
					<div className="space-y-3">
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
							{contentTemplates.map((template) => {
								const selected =
									template.templateUid === contentTemplateUid;
								return (
									<button
										type="button"
										key={template.templateUid}
										onClick={() => {
											if (selected) {
												return;
											}
											setTemplateInputError("");
											const nextTemplateUid =
												template.templateUid;
											setContentTemplateUid(
												nextTemplateUid,
											);
											const nextValues =
												templateInputValuesByUid[
													nextTemplateUid
												] || {};
											const autoSavedOverrides =
												withTemplateFingerprint(
													buildTemplateOverrides({
														fields:
															template.requiredInputs ||
															[],
														values: nextValues,
													}),
													template,
												);
											onSave(
												page.id,
												imageUrl,
												caption,
												nextTemplateUid,
												autoSavedOverrides,
												{ silent: true },
											);
										}}
										className={`text-left rounded-xl border overflow-hidden transition-all ${
											selected
												? "border-rose-400 ring-2 ring-rose-200 bg-rose-50"
												: "border-slate-200 bg-white hover:border-rose-200"
										}`}
									>
										<div className="bg-slate-100 overflow-hidden border-b border-slate-100">
											{template.thumbnails?.layout ? (
												<img
													src={
														template.thumbnails
															.layout
													}
													alt={template.templateName}
													className="block w-full h-auto object-contain"
												/>
											) : (
												<div className="w-full min-h-32 flex items-center justify-center text-[11px] text-slate-400">
													미리보기 없음
												</div>
											)}
										</div>
										<div className="p-2">
											<p className="text-xs font-semibold text-slate-800 line-clamp-2">
												{template.templateName}
											</p>
										</div>
									</button>
								);
							})}
						</div>

						{selectedTemplate && (
							<div className="rounded-xl border border-slate-200 bg-white p-3">
								<p className="text-xs font-semibold text-slate-700 mb-2">
									선택 템플릿 실시간 미리보기
								</p>
								<div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
									{selectedTemplate.thumbnails?.layout ? (
										<img
											src={
												selectedTemplate.thumbnails
													.layout
											}
											alt={selectedTemplate.templateName}
											className="block w-full h-auto object-contain"
										/>
									) : (
										<div className="w-full min-h-40 flex items-center justify-center text-sm text-slate-400">
											템플릿 미리보기가 없습니다.
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{!contentTemplateUid && (
				<div className="mb-6 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
					템플릿을 먼저 선택하면 해당 템플릿 기준으로 이미지와 페이지
					문구를 입력할 수 있습니다.
				</div>
			)}

			{(!selectedTemplate || hasAutoPhotoField) && (
				<>
					{/* 이미지 */}
					<div
						className="relative w-full aspect-[4/3] bg-rose-50 rounded-2xl border-2 border-dashed border-rose-200 overflow-hidden mb-5 cursor-pointer upload-zone group"
						onClick={() => fileRef.current?.click()}
						onDragOver={(e) => {
							e.preventDefault();
							e.currentTarget.classList.add("drag-over");
						}}
						onDragLeave={(e) =>
							e.currentTarget.classList.remove("drag-over")
						}
						onDrop={async (e) => {
							e.preventDefault();
							e.currentTarget.classList.remove("drag-over");
							const file = e.dataTransfer.files[0];
							if (file) await handleFile(file);
						}}
					>
						{imageUrl ? (
							<Image
								src={imageUrl}
								alt={`페이지 ${pageIndex + 1}`}
								fill
								className="object-cover"
								unoptimized
							/>
						) : (
							<div className="absolute inset-0 flex flex-col items-center justify-center text-rose-300">
								<span className="text-4xl mb-2">📷</span>
								<span className="text-sm">
									페이지 사진을 선택해주세요
								</span>
							</div>
						)}
						{uploading && (
							<div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-sm">
								업로드 중...
							</div>
						)}
						{imageUrl && (
							<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
								<span className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
									사진 변경
								</span>
							</div>
						)}
					</div>

					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={async (e) => {
							const file = e.target.files?.[0];
							if (file) await handleFile(file);
						}}
					/>

					{/* URL 입력 */}
					<div className="grid grid-cols-[1fr,auto] gap-2 mb-4">
						<input
							type="url"
							placeholder="또는 이미지 URL을 직접 입력하세요"
							value={imageUrl}
							onChange={(e) => setImageUrl(e.target.value)}
							className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
						/>
						<button
							onClick={() => setImageUrl(imageUrl)}
							className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition-colors"
						>
							미리보기
						</button>
					</div>
				</>
			)}
			{selectedTemplate &&
				!hasAutoPhotoField &&
				!hasCollagePhotoField && (
					<div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
						이 템플릿은 사진 없이 제작됩니다.
					</div>
				)}

			{selectedTemplate && templateRequiredInputs && (
				<div className="mb-6 space-y-3">
					{requiredInputs.length === 0 ? (
						<p className="text-xs text-emerald-700">
							이 템플릿은 필수 추가 입력값이 없습니다.
						</p>
					) : (
						requiredInputs.map((field) => {
							const isCollage = isCollagePhotoField(field);
							const binding = String(
								field.binding || "",
							).toLowerCase();
							const displayLabel = getFieldDisplayLabel(field);
							const exampleHint =
								getSuggestedExampleHint(field) ||
								formatFieldExampleHint(field.description);
							const isPaletteField = isPaletteColorField(field);
							const isDecorativeLine =
								isDecorativeLineField(field);
							const optionItems = field.options || [];
							const hasOptionIcons = optionItems.some((option) =>
								Boolean(getOptionImageUrl(option)),
							);
							const hasDefaultValue = Boolean(
								String(field.defaultValue || "").trim(),
							);

							if (isCollage) {
								const collageUrls = parseMultiUrlInput(
									selectedTemplateValues[field.name],
								);

								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-2">
											{displayLabel}
										</label>
										<div className="flex flex-col gap-2">
											<button
												type="button"
												onClick={() =>
													collageFileInputRef.current?.click()
												}
												className="w-full border-2 border-dashed border-slate-300 hover:border-rose-400 text-slate-600 hover:text-rose-600 text-sm py-3 rounded-lg transition-colors"
											>
												+ 여러 사진 선택
											</button>
											<input
												ref={collageFileInputRef}
												type="file"
												multiple
												accept="image/*"
												className="hidden"
												onChange={(e) =>
													handleCollageFiles(
														e.target.files,
														field.name,
													)
												}
											/>
											{collageUrls.length > 0 && (
												<div className="space-y-1">
													<p className="text-[11px] text-slate-600">
														{collageUrls.length}개의
														사진 선택됨
													</p>
													<div className="grid grid-cols-4 gap-1">
														{collageUrls.map(
															(
																url: string,
																idx: number,
															) => (
																<div
																	key={idx}
																	className="aspect-square rounded border border-slate-200 overflow-hidden bg-slate-50"
																>
																	<img
																		src={
																			url
																		}
																		alt={`콜라주 ${idx + 1}`}
																		className="w-full h-full object-cover"
																	/>
																</div>
															),
														)}
													</div>
												</div>
											)}
										</div>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							const placeholder =
								binding === "file"
									? "파일 URL 입력 (여러 개는 콤마로 구분)"
									: "값을 입력하세요";
							const selectedColorRaw =
								selectedTemplateValues[field.name] || "";
							const selectedColor =
								normalizeArgbColor(selectedColorRaw) || "";

							if (isPaletteField) {
								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-2">
											{displayLabel}
										</label>
										<div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
											{TEMPLATE_COLOR_PALETTE.map(
												(color) => {
													const argbColor =
														normalizeArgbColor(
															color,
														) || "#FFFFFFFF";
													const selected =
														selectedColor.toLowerCase() ===
														argbColor.toLowerCase();
													return (
														<button
															type="button"
															key={argbColor}
															onClick={() =>
																setTemplateInputValuesByUid(
																	(prev) => ({
																		...prev,
																		[contentTemplateUid]:
																			{
																				...(prev[
																					contentTemplateUid
																				] ||
																					{}),
																				[field.name]:
																					argbColor,
																			},
																	}),
																)
															}
															className={`h-8 rounded-md border ${selected ? "ring-2 ring-offset-1 ring-blue-500 border-blue-500" : "border-slate-300"}`}
															style={{
																backgroundColor:
																	argbToCssColor(
																		argbColor,
																	),
															}}
															aria-label={`${displayLabel} ${argbColor}`}
														/>
													);
												},
											)}
										</div>
										<p className="text-[11px] text-slate-500 mt-1">
											선택 값:{" "}
											{selectedColor || "선택 안됨"}
										</p>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							if (
								optionItems.length > 0 &&
								isBalloonLikeField(field) &&
								hasOptionIcons
							) {
								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-2">
											{displayLabel}
										</label>
										<div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
											{optionItems.map((option) => {
												const iconUrl =
													getOptionImageUrl(option);
												const selected =
													(selectedTemplateValues[
														field.name
													] || "") === option.value;

												return (
													<button
														type="button"
														key={`${field.name}-${option.value}`}
														onClick={() =>
															setTemplateInputValuesByUid(
																(prev) => ({
																	...prev,
																	[contentTemplateUid]:
																		{
																			...(prev[
																				contentTemplateUid
																			] ||
																				{}),
																			[field.name]:
																				option.value,
																		},
																}),
															)
														}
														className={`rounded-lg border p-2 bg-white text-left transition-colors ${selected ? "ring-2 ring-offset-1 ring-blue-500 border-blue-500" : "border-slate-200 hover:border-rose-300"}`}
													>
														{iconUrl ? (
															<img
																src={iconUrl}
																alt={
																	option.label
																}
																className="w-full h-16 object-contain rounded bg-slate-50"
															/>
														) : null}
														<p className="text-[11px] text-slate-700 mt-1 line-clamp-2">
															{option.label}
														</p>
													</button>
												);
											})}
										</div>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							if (optionItems.length > 0) {
								return (
									<div key={field.name}>
										<label className="block text-xs font-semibold text-slate-700 mb-1">
											{displayLabel}
										</label>
										<select
											value={
												selectedTemplateValues[
													field.name
												] || ""
											}
											onChange={(event) =>
												setTemplateInputValuesByUid(
													(prev) => ({
														...prev,
														[contentTemplateUid]: {
															...(prev[
																contentTemplateUid
															] || {}),
															[field.name]:
																event.target
																	.value,
														},
													}),
												)
											}
											className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
										>
											<option value="">
												선택해 주세요
											</option>
											{optionItems.map((option) => (
												<option
													key={`${field.name}-${option.value}`}
													value={option.value}
												>
													{option.label}
												</option>
											))}
										</select>
										{exampleHint && (
											<p className="text-[11px] text-slate-500 mt-1">
												{exampleHint}
											</p>
										)}
									</div>
								);
							}

							if (hasDefaultValue) {
								return (
									<div
										key={field.name}
										className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
									>
										<p className="text-xs font-semibold text-slate-700">
											{displayLabel}
										</p>
										<p className="text-[11px] text-slate-500 mt-1">
											기본값이 자동 적용됩니다.
										</p>
									</div>
								);
							}

							if (isDecorativeLine) {
								return null;
							}

							return (
								<div key={field.name}>
									<label className="block text-xs font-semibold text-slate-700 mb-1">
										{displayLabel}
									</label>
									<input
										type="text"
										value={
											selectedTemplateValues[
												field.name
											] || ""
										}
										onChange={(event) =>
											setTemplateInputValuesByUid(
												(prev) => ({
													...prev,
													[contentTemplateUid]: {
														...(prev[
															contentTemplateUid
														] || {}),
														[field.name]:
															event.target.value,
													},
												}),
											)
										}
										placeholder={placeholder}
										className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
									/>
									{exampleHint && (
										<p className="text-[11px] text-slate-500 mt-1">
											{exampleHint}
										</p>
									)}
								</div>
							);
						})
					)}
				</div>
			)}

			{templateInputError && (
				<div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{templateInputError}
				</div>
			)}

			<button
				onClick={() => {
					if (!contentTemplateUid) {
						setTemplateInputError(
							"이 페이지에 사용할 내지 템플릿을 선택해 주세요.",
						);
						return;
					}
					if (!selectedTemplate) {
						setTemplateInputError(
							"저장된 템플릿이 현재 목록에 없습니다. 새 템플릿을 선택해 주세요.",
						);
						return;
					}

					const missingField = requiredInputs.find((field) => {
						const value = selectedTemplateValues[field.name];
						return !hasRequiredFieldValue(field, value, imageUrl);
					});
					if (missingField) {
						setTemplateInputError(
							`필수 입력값을 확인해 주세요: ${missingField.label || missingField.name}`,
						);
						return;
					}

					setTemplateInputError("");
					const overrides = withTemplateFingerprint(
						buildTemplateOverrides({
							fields: requiredInputs,
							values: selectedTemplateValues,
						}),
						selectedTemplate,
					);
					onSave(
						page.id,
						imageUrl,
						"",
						contentTemplateUid,
						overrides,
					);
				}}
				className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition-colors"
			>
				페이지 저장
			</button>
		</div>
	);
}
