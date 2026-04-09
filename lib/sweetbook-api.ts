/**
 * 서버 전용 Sweetbook API 클라이언트
 * API Route 에서만 import 하세요. 클라이언트 컴포넌트에서 직접 사용 금지.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SweetbookClient } = require("../index") as {
	SweetbookClient: new (opts: {
		apiKey: string;
		environment: string;
	}) => SweetbookClientInstance;
};

interface SweetbookClientInstance {
	books: {
		create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
		get(bookUid: string): Promise<Record<string, unknown>>;
		list(
			params?: Record<string, unknown>,
		): Promise<Record<string, unknown>>;
		finalize(bookUid: string): Promise<Record<string, unknown>>;
		delete(bookUid: string): Promise<void>;
	};
	photos: {
		upload(
			bookUid: string,
			file: Blob,
			options?: Record<string, unknown>,
		): Promise<Record<string, unknown>>;
		list(bookUid: string): Promise<Record<string, unknown>>;
	};
	covers: {
		create(
			bookUid: string,
			templateUid: string,
			parameters: Record<string, unknown>,
			files?: Blob[] | Record<string, Blob | Blob[]>,
		): Promise<Record<string, unknown>>;
	};
	contents: {
		insert(
			bookUid: string,
			templateUid: string,
			parameters: Record<string, unknown>,
			options?: {
				files?: Blob[] | Record<string, Blob | Blob[]>;
				breakBefore?: string;
			},
		): Promise<Record<string, unknown>>;
		clear(bookUid: string): Promise<void>;
	};
	orders: {
		estimate(
			data: Record<string, unknown>,
		): Promise<Record<string, unknown>>;
		create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
		get(orderUid: string): Promise<Record<string, unknown>>;
		list(
			params?: Record<string, unknown>,
		): Promise<Record<string, unknown>>;
		cancel(
			orderUid: string,
			reason: string,
		): Promise<Record<string, unknown>>;
	};
	credits: {
		getBalance(): Promise<Record<string, unknown>>;
		sandboxCharge(
			amount: number,
			memo: string,
		): Promise<Record<string, unknown>>;
	};
}

let _client: SweetbookClientInstance | null = null;

export function getSweetbookClient(): SweetbookClientInstance {
	if (!_client) {
		const apiKey = process.env.SWEETBOOK_API_KEY;
		if (!apiKey || apiKey === "SB_YOUR_API_KEY") {
			throw new Error(
				"SWEETBOOK_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.",
			);
		}
		_client = new SweetbookClient({
			apiKey,
			environment: process.env.SWEETBOOK_ENV || "sandbox",
		});
	}
	return _client;
}

export function isSweetbookConfigured(): boolean {
	const key = process.env.SWEETBOOK_API_KEY;
	return !!(key && key !== "SB_YOUR_API_KEY" && key.startsWith("SB"));
}

function getSweetbookBaseUrl(): string {
	return process.env.SWEETBOOK_ENV === "sandbox"
		? "https://api-sandbox.sweetbook.com/v1"
		: "https://api.sweetbook.com/v1";
}

export interface SweetbookTemplateParameterDefinition {
	binding?: string | null;
	type?: string | null;
	required?: boolean;
	description?: string | null;
	default?: unknown;
	label?: string | null;
}

export interface SweetbookTemplateDetail {
	templateUid?: string;
	templateName?: string;
	templateKind?: string;
	bookSpecUid?: string;
	parameters?: {
		definitions?: Record<string, SweetbookTemplateParameterDefinition>;
	};
}

export interface SweetbookTemplatePublishSupport {
	supported: boolean;
	reason?: string;
	unsupportedBindings?: string[];
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

function isPrimaryTemplateImageField(
	fieldName: string,
	definition: SweetbookTemplateParameterDefinition,
	expectedKind: "cover" | "content",
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
		expectedKind === "cover"
			? ["cover", "표지"]
			: ["page", "content", "내지", "페이지"];

	return hasTemplateKeyword(search, [...baseKeywords, ...kindKeywords]);
}

export function analyzeSweetbookTemplatePublishSupport(
	detail: SweetbookTemplateDetail,
	expectedKind: "cover" | "content",
): SweetbookTemplatePublishSupport {
	const actualKind = String(detail.templateKind || "").toLowerCase();
	if (actualKind && actualKind !== expectedKind) {
		return {
			supported: false,
			reason: `${expectedKind} 템플릿이 아닙니다.`,
			unsupportedBindings: [],
		};
	}

	const definitions = detail.parameters?.definitions || {};
	const entries = Object.entries(definitions);
	if (entries.length === 0) {
		return { supported: true, unsupportedBindings: [] };
	}

	const unsupportedBindingEntries = entries.filter(([, definition]) => {
		const binding = String(definition.binding || "").toLowerCase();
		return binding && binding !== "text" && binding !== "file";
	});

	if (unsupportedBindingEntries.length > 0) {
		return {
			supported: false,
			reason: "이 앱은 text/file 바인딩만 자동으로 채울 수 있습니다.",
			unsupportedBindings: unsupportedBindingEntries.map(
				([name]) => name,
			),
		};
	}

	const fileEntries = entries.filter(
		([, definition]) =>
			String(definition.binding || "").toLowerCase() === "file",
	);
	const primaryFileEntries = fileEntries.filter(([name, definition]) =>
		isPrimaryTemplateImageField(name, definition, expectedKind),
	);

	if (primaryFileEntries.length > 1) {
		return {
			supported: false,
			reason: "메인 이미지 파일 바인딩이 여러 개라 자동 매핑할 수 없습니다.",
			unsupportedBindings: primaryFileEntries.map(([name]) => name),
		};
	}

	const requiredFileEntries = fileEntries.filter(
		([, definition]) => definition.required,
	);
	const unresolvedRequiredFiles = requiredFileEntries.filter(
		([name, definition]) =>
			!isPrimaryTemplateImageField(name, definition, expectedKind),
	);

	if (requiredFileEntries.length > 0 && primaryFileEntries.length === 0) {
		return {
			supported: false,
			reason: "필수 파일 바인딩을 메인 이미지에 연결할 수 없습니다.",
			unsupportedBindings: requiredFileEntries.map(([name]) => name),
		};
	}

	if (unresolvedRequiredFiles.length > 0) {
		return {
			supported: false,
			reason: "추가 필수 파일이 필요해 자동 발행할 수 없습니다.",
			unsupportedBindings: unresolvedRequiredFiles.map(([name]) => name),
		};
	}

	return { supported: true, unsupportedBindings: [] };
}

async function fetchSweetbookJson<T>(path: string): Promise<T> {
	const apiKey = process.env.SWEETBOOK_API_KEY;
	if (!apiKey || apiKey === "SB_YOUR_API_KEY") {
		throw new Error(
			"SWEETBOOK_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.",
		);
	}

	const response = await fetch(`${getSweetbookBaseUrl()}${path}`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		cache: "no-store",
	});

	const raw = (await response.json()) as {
		success?: boolean;
		message?: string;
		data?: T;
		errors?: string[];
	};

	if (!response.ok || raw.success === false) {
		const detail =
			raw.errors?.join(", ") || raw.message || `HTTP ${response.status}`;
		throw new Error(detail);
	}

	return (raw.data ?? raw) as T;
}

export async function fetchSweetbookTemplateDetail(
	templateUid: string,
): Promise<SweetbookTemplateDetail> {
	return fetchSweetbookJson<SweetbookTemplateDetail>(
		`/templates/${templateUid}`,
	);
}

function getFileExtFromBlob(file: Blob): string {
	const mime = (file.type || "").toLowerCase();
	if (mime === "image/jpeg") return "jpg";
	if (mime === "image/png") return "png";
	if (mime === "image/webp") return "webp";
	if (mime === "image/gif") return "gif";
	if (mime === "image/heic") return "heic";
	if (mime === "image/heif") return "heif";
	if (mime === "image/bmp") return "bmp";
	if (mime === "image/tiff") return "tiff";
	if (mime === "image/avif") return "avif";

	// 타입이 비어 있는 경우(일부 응답/환경)에는 기존 동작과 호환되게 jpg로 폴백한다.
	return "jpg";
}

export async function postSweetbookTemplateForm(
	path: string,
	templateUid: string,
	parameters: Record<string, unknown>,
	files: Record<string, Blob | Blob[]>,
	query?: Record<string, string>,
): Promise<Record<string, unknown>> {
	const apiKey = process.env.SWEETBOOK_API_KEY;
	if (!apiKey || apiKey === "SB_YOUR_API_KEY") {
		throw new Error(
			"SWEETBOOK_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.",
		);
	}

	const formData = new FormData();
	formData.append("templateUid", templateUid);
	formData.append("parameters", JSON.stringify(parameters));

	for (const [fieldName, value] of Object.entries(files)) {
		if (Array.isArray(value)) {
			value.forEach((file, index) => {
				const ext = getFileExtFromBlob(file);
				formData.append(
					fieldName,
					file,
					`${fieldName}-${index + 1}.${ext}`,
				);
			});
		} else {
			const ext = getFileExtFromBlob(value);
			formData.append(fieldName, value, `${fieldName}.${ext}`);
		}
	}

	const search = query ? `?${new URLSearchParams(query).toString()}` : "";
	const response = await fetch(`${getSweetbookBaseUrl()}${path}${search}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData,
	});

	const raw = (await response.json()) as {
		success?: boolean;
		message?: string;
		data?: Record<string, unknown>;
		errors?: string[];
	};

	if (!response.ok || raw.success === false) {
		const detail =
			raw.errors?.join(", ") || raw.message || `HTTP ${response.status}`;
		throw new Error(detail);
	}

	return raw.data ?? raw;
}

/**
 * 원격 URL 이미지를 Blob으로 다운로드
 */
export async function fetchImageBlob(
	url: string,
	baseOrigin?: string,
): Promise<Blob> {
	let resolvedUrl = url;

	// 업로드 API가 저장한 상대 경로(/uploads/...)를 서버 환경에서 절대 URL로 변환한다.
	if (url.startsWith("/")) {
		const originFromEnv =
			process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
		const origin = baseOrigin || originFromEnv;
		if (!origin) {
			throw new Error(
				`상대 이미지 경로를 해석할 수 없습니다: ${url}. NEXT_PUBLIC_APP_URL 또는 APP_BASE_URL을 설정하거나 요청 origin을 전달하세요.`,
			);
		}
		resolvedUrl = new URL(url, origin).toString();
	}

	const res = await fetch(resolvedUrl);
	if (!res.ok) throw new Error(`이미지 다운로드 실패: ${resolvedUrl}`);
	return res.blob();
}
