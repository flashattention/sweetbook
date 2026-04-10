import { NextResponse } from "next/server";
import {
	analyzeSweetbookTemplatePublishSupport,
	fetchSweetbookTemplateDetail,
	isSweetbookConfigured,
	type SweetbookTemplateDetail,
} from "@/lib/sweetbook-api";

export const dynamic = "force-dynamic";

const TEMPLATE_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const TEMPLATE_DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry<T> {
	expiresAt: number;
	value: T;
}

interface TemplateListItem {
	templateUid: string;
	templateKind?: string | null;
	[key: string]: unknown;
}

function toTemplateOptionItem(raw: unknown): {
	label: string;
	value: string;
	iconUrl?: string;
	thumbnailUrl?: string;
	previewUrl?: string;
} | null {
	if (raw === null || raw === undefined) {
		return null;
	}

	if (typeof raw === "string" || typeof raw === "number") {
		const value = String(raw).trim();
		if (!value) {
			return null;
		}
		return { label: value, value };
	}

	if (typeof raw === "object") {
		const obj = raw as Record<string, unknown>;
		const valueCandidate =
			obj.value ?? obj.key ?? obj.code ?? obj.id ?? obj.name;
		const labelCandidate = obj.label ?? obj.name ?? valueCandidate;
		const iconUrlCandidate =
			obj.iconUrl ??
			obj.icon ??
			obj.imageUrl ??
			obj.image ??
			obj.thumbnailUrl ??
			obj.thumbnail ??
			obj.previewUrl ??
			obj.preview;
		if (valueCandidate === null || valueCandidate === undefined) {
			return null;
		}
		const value = String(valueCandidate).trim();
		if (!value) {
			return null;
		}
		const label = String(labelCandidate ?? value).trim() || value;
		const iconUrl =
			typeof iconUrlCandidate === "string" &&
			String(iconUrlCandidate).trim()
				? String(iconUrlCandidate).trim()
				: undefined;
		return {
			label,
			value,
			iconUrl,
			thumbnailUrl: iconUrl,
			previewUrl: iconUrl,
		};
	}

	return null;
}

function collectTemplateFieldOptions(
	definition: Record<string, unknown>,
): Array<{
	label: string;
	value: string;
	iconUrl?: string;
	thumbnailUrl?: string;
	previewUrl?: string;
}> {
	const sources = [
		definition.enum,
		definition.options,
		definition.values,
		definition.items,
	];
	const items: Array<{ label: string; value: string }> = [];
	const seen = new Set<string>();

	for (const source of sources) {
		if (!Array.isArray(source)) {
			continue;
		}
		for (const raw of source) {
			const mapped = toTemplateOptionItem(raw);
			if (!mapped) {
				continue;
			}
			if (seen.has(mapped.value)) {
				continue;
			}
			seen.add(mapped.value);
			items.push(mapped);
		}
	}

	return items;
}

function collectTemplateFieldDefaultValue(
	definition: Record<string, unknown>,
): string | null {
	const raw = definition.default;
	if (raw === null || raw === undefined) {
		return null;
	}

	if (typeof raw === "string" || typeof raw === "number") {
		const value = String(raw).trim();
		return value || null;
	}

	return null;
}

function collectRequiredTemplateInputs(detail: SweetbookTemplateDetail) {
	const definitions = detail.parameters?.definitions || {};
	return Object.entries(definitions)
		.filter(([, definition]) => Boolean(definition.required))
		.map(([name, definition]) => {
			const rawDefinition = definition as Record<string, unknown>;
			const options = collectTemplateFieldOptions(rawDefinition);
			return {
				name,
				binding: definition.binding || null,
				type: definition.type || null,
				label: definition.label || null,
				description: definition.description || null,
				defaultValue: collectTemplateFieldDefaultValue(rawDefinition),
				options,
			};
		});
}

const templateCacheGlobal = globalThis as typeof globalThis & {
	__templateListCache?: Map<string, CacheEntry<Record<string, unknown>>>;
	__templateDetailCache?: Map<string, CacheEntry<SweetbookTemplateDetail>>;
};

function getTemplateListCache() {
	if (!templateCacheGlobal.__templateListCache) {
		templateCacheGlobal.__templateListCache = new Map();
	}
	return templateCacheGlobal.__templateListCache;
}

function getTemplateDetailCache() {
	if (!templateCacheGlobal.__templateDetailCache) {
		templateCacheGlobal.__templateDetailCache = new Map();
	}
	return templateCacheGlobal.__templateDetailCache;
}

function getCacheValue<T>(entry: CacheEntry<T> | undefined): T | null {
	if (!entry) {
		return null;
	}
	if (entry.expiresAt < Date.now()) {
		return null;
	}
	return entry.value;
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	mapper: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	for (let index = 0; index < items.length; index += limit) {
		const chunk = items.slice(index, index + limit);
		const chunkResults = await Promise.all(chunk.map(mapper));
		results.push(...chunkResults);
	}
	return results;
}

// GET /api/templates
export async function GET(request: Request) {
	if (!isSweetbookConfigured()) {
		return NextResponse.json({
			success: false,
			error: "SWEETBOOK_API_KEY가 설정되지 않았습니다.",
			data: [],
		});
	}

	try {
		const { searchParams } = new URL(request.url);
		const compatibilityMode = searchParams.get("compatibility");
		const upstreamParams = new URLSearchParams(searchParams);
		upstreamParams.delete("compatibility");

		const requestedLimit = Number(searchParams.get("limit") || "50");
		const requestedOffset = Number(searchParams.get("offset") || "0");
		const normalizedLimit = Number.isFinite(requestedLimit)
			? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
			: 50;
		const normalizedOffset = Number.isFinite(requestedOffset)
			? Math.max(0, Math.trunc(requestedOffset))
			: 0;
		upstreamParams.set("limit", String(normalizedLimit));
		upstreamParams.set("offset", String(normalizedOffset));
		const env =
			process.env.SWEETBOOK_ENV === "sandbox" ? "sandbox" : "live";
		const cacheKey = `env:${env}|compat:${compatibilityMode || "none"}|qs:${upstreamParams.toString()}`;
		const listCache = getTemplateListCache();
		const cachedListData = getCacheValue(listCache.get(cacheKey));
		if (cachedListData) {
			return NextResponse.json({ success: true, data: cachedListData });
		}

		const baseUrl =
			env === "sandbox"
				? "https://api-sandbox.sweetbook.com/v1"
				: "https://api.sweetbook.com/v1";

		const qs = upstreamParams.toString();
		const res = await fetch(`${baseUrl}/templates${qs ? `?${qs}` : ""}`, {
			headers: {
				Authorization: `Bearer ${process.env.SWEETBOOK_API_KEY}`,
			},
			cache: "no-store",
		});
		const raw = (await res.json()) as {
			success?: boolean;
			data?: unknown;
			message?: string;
			errors?: string[];
		};
		if (!res.ok) {
			return NextResponse.json(
				{ success: false, error: raw?.message || "템플릿 조회 실패" },
				{ status: res.status },
			);
		}
		if (raw.success === false) {
			return NextResponse.json(
				{
					success: false,
					error:
						raw.errors?.join(", ") ||
						raw.message ||
						"템플릿 조회 실패",
				},
				{ status: 502 },
			);
		}

		const payload = raw.data ?? raw;
		const normalizedData =
			payload && typeof payload === "object" && !Array.isArray(payload)
				? { ...(payload as Record<string, unknown>) }
				: { templates: Array.isArray(payload) ? payload : [] };
		const templates = Array.isArray(normalizedData.templates)
			? (normalizedData.templates as TemplateListItem[])
			: [];
		const detailCache = getTemplateDetailCache();

		if (compatibilityMode === "publish") {
			normalizedData.templates = await mapWithConcurrency(
				templates,
				6,
				async (template) => {
					const expectedKind = String(
						template.templateKind || "",
					).toLowerCase();
					if (
						expectedKind !== "cover" &&
						expectedKind !== "content"
					) {
						return template;
					}

					try {
						const detailCacheKey = `${env}:${template.templateUid}`;
						let detail = getCacheValue(
							detailCache.get(detailCacheKey),
						);
						if (!detail) {
							detail = await fetchSweetbookTemplateDetail(
								template.templateUid,
							);
							detailCache.set(detailCacheKey, {
								expiresAt:
									Date.now() + TEMPLATE_DETAIL_CACHE_TTL_MS,
								value: detail,
							});
						}
						const analyzed = analyzeSweetbookTemplatePublishSupport(
							detail as SweetbookTemplateDetail,
							expectedKind,
						);
						const requiredInputs = collectRequiredTemplateInputs(
							detail as SweetbookTemplateDetail,
						);
						return {
							...template,
							requiredInputs,
							publishSupport: {
								supported: true,
								reason: analyzed.supported
									? "auto"
									: analyzed.reason ||
										"자동 매핑 확장 경로로 처리",
								unsupportedBindings:
									analyzed.unsupportedBindings || [],
							},
						};
					} catch (detailError) {
						return {
							...template,
							publishSupport: {
								supported: true,
								reason:
									detailError instanceof Error
										? detailError.message
										: "템플릿 상세를 확인하지 못했습니다.",
								unsupportedBindings: [],
							},
						};
					}
				},
			);
		}

		listCache.set(cacheKey, {
			expiresAt: Date.now() + TEMPLATE_LIST_CACHE_TTL_MS,
			value: normalizedData,
		});

		return NextResponse.json({ success: true, data: normalizedData });
	} catch (err) {
		console.error("[GET /api/templates]", err);
		return NextResponse.json(
			{
				success: false,
				error: err instanceof Error ? err.message : "템플릿 조회 실패",
			},
			{ status: 500 },
		);
	}
}
