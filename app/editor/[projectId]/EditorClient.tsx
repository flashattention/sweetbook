"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Project, Page } from "@/types";

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

export default function EditorClient({ initialProject }: Props) {
	const router = useRouter();
	const [project, setProject] = useState<Project>(initialProject);
	const [pages, setPages] = useState<Page[]>(initialProject.pages);
	const [activeTab, setActiveTab] = useState<ActiveTab>("cover");
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [message, setMessage] = useState("");
	const [messageType, setMessageType] = useState<"success" | "error">(
		"success",
	);

	function showMsg(text: string, type: "success" | "error" = "success") {
		setMessage(text);
		setMessageType(type);
		setTimeout(() => setMessage(""), 3000);
	}

	/* ─── 표지 저장 ─── */
	async function saveCover(coverImageUrl: string, coverCaption: string) {
		setSaving(true);
		try {
			const res = await fetch(`/api/projects/${project.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ coverImageUrl, coverCaption }),
			});
			if (res.ok) {
				setProject((p) => ({ ...p, coverImageUrl, coverCaption }));
				showMsg("표지가 저장되었습니다.");
			}
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
		}
	}

	/* ─── 페이지 저장 ─── */
	async function savePage(pageId: string, imageUrl: string, caption: string) {
		setSaving(true);
		try {
			const res = await fetch(
				`/api/projects/${project.id}/pages/${pageId}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ imageUrl, caption }),
				},
			);
			if (res.ok) {
				setPages((prev) =>
					prev.map((pg) =>
						pg.id === pageId ? { ...pg, imageUrl, caption } : pg,
					),
				);
				showMsg("페이지가 저장되었습니다.");
			}
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
		setPublishing(true);
		try {
			let res = await fetch(`/api/projects/${project.id}/publish`, {
				method: "POST",
			});
			let json = (await res.json()) as PublishErrorPayload & {
				estimate?: { totalPrice?: number };
			};

			if (!res.ok && json.requiredInputs) {
				const wantsRetry = confirm(
					"선택한 템플릿에 추가 입력이 필요합니다. 지금 입력해서 다시 출판할까요?",
				);
				if (wantsRetry) {
					const coverOverrides = collectOverridesFromPrompt(
						"cover",
						json.requiredInputs.cover,
					);
					const contentOverrides = collectOverridesFromPrompt(
						"content",
						json.requiredInputs.content,
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
					<div className="flex-1 overflow-y-auto">
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
						<CoverPanel project={project} onSave={saveCover} />
					) : activePage ? (
						<PagePanel
							page={activePage}
							pageIndex={pages.findIndex(
								(p) => p.id === activePage.id,
							)}
							onSave={savePage}
							onDelete={deletePage}
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
}: {
	project: Project;
	onSave: (imageUrl: string, caption: string) => void;
}) {
	const [imageUrl, setImageUrl] = useState(project.coverImageUrl || "");
	const [caption, setCaption] = useState(project.coverCaption || "");
	const [uploading, setUploading] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setImageUrl(project.coverImageUrl || "");
		setCaption(project.coverCaption || "");
	}, [project.coverImageUrl, project.coverCaption]);

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
			<div className="mb-6">
				<label className="block text-sm font-semibold text-gray-700 mb-1.5">
					표지 문구
				</label>
				<input
					type="text"
					placeholder="예: 사랑은 매일 선택하는 것"
					value={caption}
					onChange={(e) => setCaption(e.target.value)}
					className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
				/>
			</div>

			<button
				onClick={() => onSave(imageUrl, caption)}
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
}: {
	page: Page;
	pageIndex: number;
	onSave: (id: string, imageUrl: string, caption: string) => void;
	onDelete: (id: string) => void;
}) {
	const [imageUrl, setImageUrl] = useState(page.imageUrl);
	const [caption, setCaption] = useState(page.caption);
	const [uploading, setUploading] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setImageUrl(page.imageUrl);
		setCaption(page.caption);
	}, [page.id, page.imageUrl, page.caption]);

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

			<button
				onClick={() => onSave(page.id, imageUrl, caption)}
				className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition-colors"
			>
				페이지 저장
			</button>
		</div>
	);
}
