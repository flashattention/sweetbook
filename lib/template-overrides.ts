export interface TemplateRequiredInput {
	name: string;
	binding?: string | null;
	type?: string | null;
	label?: string | null;
	description?: string | null;
	defaultValue?: string | null;
	options?: Array<{
		label: string;
		value: string;
	}>;
}

export interface PublishTemplateOverrides {
	parameters?: Record<string, unknown>;
	fileUrls?: Record<string, string | string[]>;
}

export interface ProjectTemplateOverrides {
	coverOverrides?: PublishTemplateOverrides;
	contentOverrides?: PublishTemplateOverrides;
	createdAt: number;
}

function isFileLikeBinding(binding: string | null | undefined): boolean {
	const normalized = String(binding || "").toLowerCase();
	return normalized === "file" || normalized.includes("gallery");
}

function parseFileUrlValues(raw: string): string[] {
	const trimmed = raw.trim();
	if (!trimmed) {
		return [];
	}

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed
					.map((item) => String(item || "").trim())
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
		const trimmed = value.trim();
		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return parsed;
				}
			} catch {
				// Fall back to comma-separated parsing.
			}
		}
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

export function buildTemplateOverrides(params: {
	fields: TemplateRequiredInput[];
	values: Record<string, string>;
}): PublishTemplateOverrides | undefined {
	const parameters: Record<string, unknown> = {};
	const fileUrls: Record<string, string | string[]> = {};

	for (const field of params.fields) {
		const raw = params.values[field.name];
		if (typeof raw !== "string") {
			continue;
		}
		const value = raw.trim();
		if (!value) {
			continue;
		}

		if (isFileLikeBinding(field.binding)) {
			const urls = parseFileUrlValues(value);
			if (urls.length === 1) {
				fileUrls[field.name] = urls[0];
			} else if (urls.length > 1) {
				fileUrls[field.name] = urls;
			}
			continue;
		}

		parameters[field.name] = parseUserInputByType(value, field.type);
	}

	if (
		Object.keys(parameters).length === 0 &&
		Object.keys(fileUrls).length === 0
	) {
		return undefined;
	}

	return {
		parameters,
		fileUrls,
	};
}

export function mergeTemplateOverrides(
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

export function parseTemplateOverridesFromUnknown(
	value: unknown,
): PublishTemplateOverrides | undefined {
	if (!value) {
		return undefined;
	}

	if (typeof value === "string") {
		try {
			return parseTemplateOverridesFromUnknown(JSON.parse(value));
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
			? (raw.parameters as Record<string, unknown>)
			: undefined;
	const fileUrls =
		raw.fileUrls && typeof raw.fileUrls === "object"
			? (raw.fileUrls as Record<string, string | string[]>)
			: undefined;

	if (!parameters && !fileUrls) {
		return undefined;
	}

	return { parameters, fileUrls };
}

export function serializeTemplateOverrides(value: unknown): string | undefined {
	const parsed = parseTemplateOverridesFromUnknown(value);
	if (!parsed) {
		return undefined;
	}
	return JSON.stringify(parsed);
}
