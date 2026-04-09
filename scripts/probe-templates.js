"use strict";

require("dotenv/config");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.SWEETBOOK_API_KEY;
const ENV = process.env.SWEETBOOK_ENV === "sandbox" ? "sandbox" : "live";
const BASE_URL =
	ENV === "sandbox"
		? "https://api-sandbox.sweetbook.com/v1"
		: "https://api.sweetbook.com/v1";

const DEFAULT_BOOK_SPEC = process.env.PROBE_BOOK_SPEC || "SQUAREBOOK_HC";
const DEFAULT_COVER_TEMPLATE =
	process.env.SWEETBOOK_COVER_TEMPLATE_UID || "39kySqmyRhhs";
const IMAGE_URL = "https://picsum.photos/seed/template-probe/1200/900";

function parseArgs() {
	const args = process.argv.slice(2);
	const out = {
		bookSpecUid: DEFAULT_BOOK_SPEC,
		limit: Number.POSITIVE_INFINITY,
		kind: "all",
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--bookSpec" && args[i + 1]) {
			out.bookSpecUid = args[i + 1];
			i += 1;
			continue;
		}
		if (arg === "--limit" && args[i + 1]) {
			out.limit = Math.max(1, Number(args[i + 1]) || 1);
			i += 1;
			continue;
		}
		if (arg === "--kind" && args[i + 1]) {
			out.kind = args[i + 1];
			i += 1;
		}
	}

	return out;
}

async function sbFetch(pathname, options = {}) {
	const res = await fetch(`${BASE_URL}${pathname}`, {
		...options,
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			...(options.headers || {}),
		},
	});
	const rawText = await res.text();
	let body;
	try {
		body = JSON.parse(rawText);
	} catch {
		body = { rawText };
	}

	if (!res.ok || body.success === false) {
		const message =
			body?.errors?.join(", ") ||
			body?.message ||
			body?.error ||
			`HTTP ${res.status}`;
		const err = new Error(message);
		err.status = res.status;
		err.body = body;
		throw err;
	}

	return body.data ?? body;
}

async function fetchAllTemplates() {
	const all = [];
	let offset = 0;
	const limit = 100;
	while (true) {
		const data = await sbFetch(
			`/templates?limit=${limit}&offset=${offset}`,
		);
		const batch = data.templates || [];
		all.push(...batch);
		if (!(data.pagination && data.pagination.hasNext)) {
			break;
		}
		offset += limit;
	}
	return all;
}

function normalizeText(...values) {
	return values
		.filter((v) => typeof v === "string")
		.join(" ")
		.toLowerCase()
		.replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function hasKeyword(source, list) {
	return list.some((k) => source.includes(k));
}

function buildProbePayload(detail, imageBlob) {
	const definitions = detail?.parameters?.definitions || {};
	const parameters = {};
	const files = {};
	const sampleImageUrl = IMAGE_URL;

	for (const [name, definition] of Object.entries(definitions)) {
		const binding = String(definition?.binding || "").toLowerCase();
		const type = String(definition?.type || "").toLowerCase();
		const search = normalizeText(
			name,
			definition?.label,
			definition?.description,
			definition?.binding,
			definition?.type,
		);

		if (definition?.default !== undefined) {
			parameters[name] = definition.default;
			continue;
		}

		if (binding === "file") {
			if (
				type.includes("array") ||
				hasKeyword(search, ["gallery", "rows", "items", "photos"])
			) {
				files[name] = [imageBlob];
			} else {
				files[name] = imageBlob;
			}
			continue;
		}

		if (binding === "text" || binding.length === 0) {
			parameters[name] = "template probe";
			continue;
		}

		if (
			type.includes("array") ||
			binding.includes("gallery") ||
			binding.includes("row")
		) {
			parameters[name] = [
				{
					photo: sampleImageUrl,
					image: sampleImageUrl,
					url: sampleImageUrl,
					title: "template probe",
					caption: "template probe",
					text: "template probe",
				},
			];
			continue;
		}

		if (type.includes("boolean") || hasKeyword(search, ["has", "use"])) {
			parameters[name] = true;
			continue;
		}

		if (type.includes("number") || type.includes("integer")) {
			parameters[name] = 1;
			continue;
		}

		if (type.includes("object")) {
			parameters[name] = {
				photo: sampleImageUrl,
				image: sampleImageUrl,
				url: sampleImageUrl,
				title: "template probe",
				caption: "template probe",
				text: "template probe",
			};
			continue;
		}

		parameters[name] = "template probe";
	}

	return { parameters, files };
}

async function postTemplateForm(pathname, templateUid, parameters, files) {
	const form = new FormData();
	form.append("templateUid", templateUid);
	form.append("parameters", JSON.stringify(parameters || {}));

	for (const [fieldName, fileValue] of Object.entries(files || {})) {
		if (Array.isArray(fileValue)) {
			for (let i = 0; i < fileValue.length; i += 1) {
				form.append(
					fieldName,
					fileValue[i],
					`${fieldName}-${i + 1}.jpg`,
				);
			}
		} else {
			form.append(fieldName, fileValue, `${fieldName}.jpg`);
		}
	}

	return sbFetch(pathname, { method: "POST", body: form });
}

async function runSingleTemplateProbe(template, imageBlob) {
	const result = {
		templateUid: template.templateUid,
		templateName: template.templateName,
		templateKind: template.templateKind,
		bookSpecUid: template.bookSpecUid,
		ok: false,
		error: null,
		requiredFields: [],
	};

	let bookUid = null;
	try {
		const book = await sbFetch("/Books", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				bookSpecUid: template.bookSpecUid,
				title: `probe-${template.templateUid}`,
				creationType: "NORMAL",
			}),
		});
		bookUid = book.bookUid;
		if (!bookUid) {
			throw new Error("bookUid missing");
		}

		const detail = await sbFetch(`/templates/${template.templateUid}`);
		const requiredFields = Object.entries(
			detail?.parameters?.definitions || {},
		)
			.filter(([, d]) => Boolean(d && d.required))
			.map(([name, d]) => ({
				name,
				binding: d.binding || null,
				type: d.type || null,
				label: d.label || null,
				description: d.description || null,
			}));
		result.requiredFields = requiredFields;

		const payload = buildProbePayload(detail, imageBlob);

		if (String(template.templateKind).toLowerCase() === "cover") {
			await postTemplateForm(
				`/Books/${bookUid}/cover`,
				template.templateUid,
				payload.parameters,
				payload.files,
			);
		} else {
			await postTemplateForm(
				`/Books/${bookUid}/cover`,
				DEFAULT_COVER_TEMPLATE,
				{
					childName: "probe",
					schoolName: "probe",
					volumeLabel: "1",
					periodText: "2026.04.09",
				},
				{ coverPhoto: imageBlob },
			);
			await postTemplateForm(
				`/Books/${bookUid}/contents?breakBefore=page`,
				template.templateUid,
				payload.parameters,
				payload.files,
			);
		}

		result.ok = true;
	} catch (error) {
		result.ok = false;
		result.error = {
			message: error?.message || String(error),
			status: error?.status || null,
			body: error?.body || null,
		};
	} finally {
		if (bookUid) {
			try {
				await sbFetch(`/Books/${bookUid}`, { method: "DELETE" });
			} catch {
				// noop
			}
		}
	}

	return result;
}

async function main() {
	if (!API_KEY) {
		throw new Error("SWEETBOOK_API_KEY is required");
	}

	const args = parseArgs();
	const imageBlob = await fetch(IMAGE_URL).then((r) => r.blob());
	const templates = await fetchAllTemplates();

	const filtered = templates.filter((template) => {
		if (template.bookSpecUid !== args.bookSpecUid) {
			return false;
		}
		const kind = String(template.templateKind || "").toLowerCase();
		if (args.kind === "all") return kind === "cover" || kind === "content";
		return kind === String(args.kind).toLowerCase();
	});

	const targets = filtered.slice(0, args.limit);
	const results = [];

	console.log(
		`PROBE_START templates=${targets.length} bookSpec=${args.bookSpecUid} kind=${args.kind}`,
	);

	for (let i = 0; i < targets.length; i += 1) {
		const t = targets[i];
		const r = await runSingleTemplateProbe(t, imageBlob);
		results.push(r);
		console.log(
			`${i + 1}/${targets.length} ${t.templateKind} ${t.templateUid} ${r.ok ? "OK" : "FAIL"}`,
		);
	}

	const ok = results.filter((r) => r.ok).length;
	const fail = results.length - ok;
	const summary = {
		env: ENV,
		bookSpecUid: args.bookSpecUid,
		kind: args.kind,
		total: results.length,
		ok,
		fail,
		generatedAt: new Date().toISOString(),
	};

	const out = { summary, results };
	const outPath = path.join(process.cwd(), "scripts", "probe-results.json");
	fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

	console.log("PROBE_DONE", JSON.stringify(summary));
	console.log(`RESULT_FILE ${outPath}`);

	if (fail > 0) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error("FATAL", error?.message || String(error));
	process.exit(1);
});
