"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Project, Page } from "@/types";
import {
	buildTemplateOverrides,
	mergeTemplateOverrides,
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
}

interface PublishErrorPayload {
	success?: boolean;
	error?: string;
	hint?: string;
	requiredInputs?: {
		cover?: RequiredTemplateInputField[];
		content?: RequiredTemplateInputField[];
	};
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

function collectOverridesFromPrompt(
	sectionName: "cover" | "content",
	fields: RequiredTemplateInputField[] | undefined,
) {
	if (!fields || fields.length === 0) {
		return undefined;
	}

	const parameters: Record<string, unknown> = {};
	const fileUrls: Record<string, string | string[]> = {};

	for (const field of fields) {
		const label = field.label || field.name;
		const description = field.description
			? `\n설명: ${field.description}`
			: "";
		const binding = String(field.binding || "").toLowerCase();
		const type = String(field.type || "");

		if (binding === "file") {
			const input = prompt(
				`[${sectionName}] 파일 필드 ${label} (${field.name}) URL 입력\n여러 개면 콤마(,)로 구분${description}`,
			);
			if (!input) {
				continue;
			}
			const urls = input
				.split(",")
				.map((url) => url.trim())
				.filter(Boolean);
			if (urls.length === 1) {
				fileUrls[field.name] = urls[0];
			} else if (urls.length > 1) {
				fileUrls[field.name] = urls;
			}
			continue;
		}

		const input = prompt(
			`[${sectionName}] 값 입력 ${label} (${field.name})\n타입: ${type || "string"}${description}`,
		);
		if (input === null || input.trim() === "") {
			continue;
		}
		parameters[field.name] = parseUserInputByType(input.trim(), field.type);
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
		volumelabel: "권수",
		periodtext: "기록 날짜",
		daterange: "기간",
		title: "제목",
		subtitle: "부제",
		spinetitle: "등표지 문구",
		monthnum: "월",
		daynum: "일",
		diarytext: "본문",
		photo: "사진",
		coverphoto: "표지 이미지",
		frontphoto: "표지 이미지",
		collagephotos: "콜라주 이미지",
	};

	if (labelMap[key]) {
		return labelMap[key];
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

	const match = raw.match(/예\s*:\s*([^\n)]+)/);
	if (match && match[1]) {
		return `예: ${match[1].trim()}`;
	}

	return raw;
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
	const pageListScrollRef = useRef<HTMLDivElement>(null);
	const [project, setProject] = useState<Project>(initialProject);
	const [pages, setPages] = useState<Page[]>(initialProject.pages);
	const [activeTab, setActiveTab] = useState<ActiveTab>("cover");
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
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
		const listEl = pageListScrollRef.current;
		if (!listEl) {
			return;
		}

		// Wait for the newly appended page item to be painted before scrolling.
		requestAnimationFrame(() => {
			listEl.scrollTop = listEl.scrollHeight;
		});
	}

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
	) {
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
				showMsg("페이지가 저장되었습니다.");
			} else {
				const errorMsg = json?.error || "페이지 저장에 실패했습니다.";
				showMsg(errorMsg, "error");
			}
		} catch (err: unknown) {
			const errorMsg =
				err instanceof Error ? err.message : "페이지 저장 중 오류 발생";
			showMsg(errorMsg, "error");
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

	/* ─── 출판하기 ─── */
	async function handlePublish() {
		if (pages.length === 0) {
			showMsg("최소 1페이지 이상 추가해 주세요.", "error");
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
		setPublishing(true);
		try {
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
			let res = await fetch(`/api/projects/${project.id}/publish`, {
				method: "POST",
				headers: basePublishBody
					? { "Content-Type": "application/json" }
					: undefined,
				body: basePublishBody
					? JSON.stringify(basePublishBody)
					: undefined,
			});
			let json = (await res.json()) as PublishErrorPayload & {
				estimate?: { totalPrice?: number };
			};

			if (!res.ok && json.requiredInputs) {
				const wantsRetry = confirm(
					"선택한 템플릿에 추가 입력이 필요합니다. 지금 입력해서 다시 출판할까요?",
				);
				if (wantsRetry) {
					const promptCoverOverrides = collectOverridesFromPrompt(
						"cover",
						json.requiredInputs.cover,
					);
					const promptContentOverrides = collectOverridesFromPrompt(
						"content",
						json.requiredInputs.content,
					);
					const coverOverrides = mergeTemplateOverrides(
						basePublishBody?.coverOverrides,
						promptCoverOverrides,
					);
					const contentOverrides = mergeTemplateOverrides(
						basePublishBody?.contentOverrides,
						promptContentOverrides,
					);

					res = await fetch(`/api/projects/${project.id}/publish`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							coverOverrides,
							contentOverrides,
						}),
					});
					json = (await res.json()) as PublishErrorPayload & {
						estimate?: { totalPrice?: number };
					};
				}
			}

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

	const activePage = pages.find((p) => p.id === activeTab);

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
					<button
						onClick={handlePublish}
						disabled={publishing}
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
				<main className="flex-1 overflow-y-auto p-8">
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
		(field) => !isAutoManagedCoverTemplateField(field),
	);
	const selectedTemplateValues =
		templateInputValuesByUid[coverTemplateUid] || {};
	const isSavedTemplateUnavailable =
		Boolean(coverTemplateUid) && selectedTemplate === null;

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
		if (coverTemplates.length > 0 && !coverTemplateUid) {
			setCoverTemplateUid(coverTemplates[0].templateUid);
		}
		if (coverTemplates.length === 0) {
			setCoverTemplateUid("");
		}
	}, [coverTemplateUid, coverTemplates]);

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
										<div className="aspect-[4/3] bg-slate-100 overflow-hidden border-b border-slate-100">
											{template.thumbnails?.layout ? (
												<img
													src={
														template.thumbnails
															.layout
													}
													alt={template.templateName}
													className="w-full h-full object-cover"
												/>
											) : (
												<div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400">
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
								<div className="aspect-[4/3] rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
									{selectedTemplate.thumbnails?.layout ? (
										<img
											src={
												selectedTemplate.thumbnails
													.layout
											}
											alt={selectedTemplate.templateName}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center text-sm text-slate-400">
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
							const exampleHint = formatFieldExampleHint(
								field.description,
							);
							const placeholder =
								binding === "file"
									? "파일 URL 입력 (여러 개는 콤마로 구분)"
									: "값을 입력하세요";

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
						return !value || value.trim() === "";
					});
					if (missingField) {
						setTemplateInputError(
							`필수 입력값을 확인해 주세요: ${missingField.label || missingField.name}`,
						);
						return;
					}

					setTemplateInputError("");
					onSave(
						imageUrl,
						caption,
						coverTemplateUid,
						buildTemplateOverrides({
							fields: requiredInputs,
							values: selectedTemplateValues,
						}),
					);
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
	const requiredInputs = selectedTemplate?.requiredInputs || [];
	const collagePhotoFields = requiredInputs.filter((field) =>
		isCollagePhotoField(field),
	);
	const selectedTemplateValues =
		templateInputValuesByUid[contentTemplateUid] || {};
	const isSavedTemplateUnavailable =
		Boolean(contentTemplateUid) && selectedTemplate === null;

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
											setTemplateInputError("");
											setContentTemplateUid(
												template.templateUid,
											);
										}}
										className={`text-left rounded-xl border overflow-hidden transition-all ${
											selected
												? "border-rose-400 ring-2 ring-rose-200 bg-rose-50"
												: "border-slate-200 bg-white hover:border-rose-200"
										}`}
									>
										<div className="aspect-[4/3] bg-slate-100 overflow-hidden border-b border-slate-100">
											{template.thumbnails?.layout ? (
												<img
													src={
														template.thumbnails
															.layout
													}
													alt={template.templateName}
													className="w-full h-full object-cover"
												/>
											) : (
												<div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400">
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
								<div className="aspect-[4/3] rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
									{selectedTemplate.thumbnails?.layout ? (
										<img
											src={
												selectedTemplate.thumbnails
													.layout
											}
											alt={selectedTemplate.templateName}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center text-sm text-slate-400">
											템플릿 미리보기가 없습니다.
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				)}

				{selectedTemplate && selectedTemplate.requiredInputs && (
					<div className="space-y-3">
						{selectedTemplate.requiredInputs.length === 0 ? (
							<p className="text-xs text-emerald-700">
								이 템플릿은 필수 추가 입력값이 없습니다.
							</p>
						) : (
							selectedTemplate.requiredInputs.map((field) => {
								const isCollage = isCollagePhotoField(field);
								const binding = String(
									field.binding || "",
								).toLowerCase();
								const displayLabel =
									getFieldDisplayLabel(field);
								const exampleHint = formatFieldExampleHint(
									field.description,
								);

								if (isCollage) {
									const collageUrls =
										selectedTemplateValues[field.name]
											?.split(",")
											.map((u: string) => u.trim())
											.filter(Boolean) || [];

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
															{collageUrls.length}
															개의 사진 선택됨
														</p>
														<div className="grid grid-cols-4 gap-1">
															{collageUrls.map(
																(
																	url: string,
																	idx: number,
																) => (
																	<div
																		key={
																			idx
																		}
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
																event.target
																	.value,
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
			</div>

			{!contentTemplateUid && (
				<div className="mb-6 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
					템플릿을 먼저 선택하면 해당 템플릿 기준으로 이미지와 페이지
					문구를 입력할 수 있습니다.
				</div>
			)}

			{/* 이미지 */}
			<div
				className="relative w-full aspect-[4/3] bg-gray-100 rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden mb-5 cursor-pointer upload-zone group"
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
					<div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
						<span className="text-4xl mb-2">📷</span>
						<span className="text-sm">
							클릭하거나 사진을 끌어다 놓세요
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

			{/* 문구 */}
			<div className="mb-6">
				<label className="block text-sm font-semibold text-gray-700 mb-1.5">
					페이지 문구
				</label>
				<textarea
					rows={3}
					placeholder="이 순간에 담고 싶은 이야기를 적어보세요…"
					value={caption}
					onChange={(e) => setCaption(e.target.value)}
					className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
				/>
			</div>

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
						return !value || value.trim() === "";
					});
					if (missingField) {
						setTemplateInputError(
							`필수 입력값을 확인해 주세요: ${missingField.label || missingField.name}`,
						);
						return;
					}

					setTemplateInputError("");
					onSave(
						page.id,
						imageUrl,
						caption,
						contentTemplateUid,
						buildTemplateOverrides({
							fields: requiredInputs,
							values: selectedTemplateValues,
						}),
					);
				}}
				className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition-colors"
			>
				페이지 저장
			</button>
		</div>
	);
}
