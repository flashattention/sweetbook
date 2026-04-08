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
				formData.append(
					fieldName,
					file,
					`${fieldName}-${index + 1}.jpg`,
				);
			});
		} else {
			formData.append(fieldName, value, `${fieldName}.jpg`);
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
export async function fetchImageBlob(url: string): Promise<Blob> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`이미지 다운로드 실패: ${url}`);
	return res.blob();
}
