"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

interface ProgressProject {
	id: string;
	title: string;
	projectType: "COMIC" | "NOVEL" | "PHOTOBOOK";
	genre?: string | null;
	storyCharacters?: string | null;
	requestedPageCount?: number | null;
	comicStyle?: string | null;
	status: "DRAFT" | "PUBLISHED" | "ORDERED";
	generationStage?: string | null;
	generationProgress?: number | null;
	generationError?: string | null;
	generationCostUsd?: number | null;
}

interface ProjectResponse {
	success: boolean;
	data?: ProgressProject;
	error?: string;
	errorCode?: string;
}

const STAGE_LABEL_COMIC: Record<string, string> = {
	QUEUED: "대기 중",
	PLANNING: "스토리 기획 중",
	IMAGING: "컷 이미지 생성 중",
	SAVING: "페이지 저장 중",
	PUBLISHING: "출판 처리 중",
	COMPLETED: "완료",
	FAILED: "실패",
};

const STAGE_LABEL_NOVEL: Record<string, string> = {
	QUEUED: "대기 중",
	PLANNING: "스토리 아웃라인 기획 중",
	WRITING: "페이지 집필 중",
	SAVING: "페이지 저장 중",
	PUBLISHING: "출판 처리 중",
	COMPLETED: "완료",
	FAILED: "실패",
};

const COMIC_STYLE_LABEL: Record<string, string> = {
	MANGA: "만화 (망가)",
	CARTOON: "만화 (카툰)",
	AMERICAN: "만화 (아메리칸)",
	PICTURE_BOOK: "그림책",
};

const DEFAULT_KRW_RATE = 1350;

function formatCostKrw(usd: number): string {
	const krw = Math.round(usd * DEFAULT_KRW_RATE);
	return `₩${krw.toLocaleString("ko-KR")} (USD $${usd.toFixed(4)})`;
}

function getStageLabelMap(projectType: "COMIC" | "NOVEL" | "PHOTOBOOK") {
	return projectType === "NOVEL" ? STAGE_LABEL_NOVEL : STAGE_LABEL_COMIC;
}

function normalizeProgress(value: number | null | undefined) {
	if (typeof value !== "number") return 0;
	return Math.max(0, Math.min(100, value));
}

export default function CreateProgressPage() {
	const params = useParams<{ projectId: string }>();
	const projectId = params?.projectId;
	const router = useRouter();
	const searchParams = useSearchParams();
	const [project, setProject] = useState<ProgressProject | null>(null);
	const [error, setError] = useState("");
	const [starting, setStarting] = useState(false);
	const [quotaBlocked, setQuotaBlocked] = useState(false);
	const [retryPending, setRetryPending] = useState(false);
	const startedRef = useRef(false);
	const quotaAlertedRef = useRef(false);

	function isQuotaError(text?: string | null) {
		const message = String(text || "").toLowerCase();
		return (
			message.includes("insufficient_quota") ||
			message.includes("current quota") ||
			message.includes("quota exceeded") ||
			message.includes("api 크레딧")
		);
	}

	function handleQuotaBlockedWarning(message?: string) {
		if (quotaAlertedRef.current) {
			return;
		}

		quotaAlertedRef.current = true;
		setQuotaBlocked(true);
		startedRef.current = true;
		window.alert(
			message ||
				"OpenAI API 크레딧이 부족합니다. 충전 후 홈에서 다시 시도해 주세요.",
		);
		router.replace("/");
	}

	const stageLabel = useMemo(() => {
		if (!project?.generationStage) return "준비 중";
		const stage = project.generationStage;
		if (stage.startsWith("IMAGING:")) {
			const [, doneStr, totalStr] = stage.split(":");
			const done = Number(doneStr);
			const total = Number(totalStr);
			if (done === 0) return `컷 이미지 생성 중 (0 / ${total})...`;
			return `컷 이미지 생성 중 (${done} / ${total})...`;
		}
		if (stage.startsWith("WRITING:")) {
			const [, doneStr, totalStr] = stage.split(":");
			const done = Number(doneStr);
			const total = Number(totalStr);
			if (done === 0) return `소설 페이지 집필 준비 중 (0 / ${total})...`;
			return `소설 페이지 집필 중 (${done} / ${total})...`;
		}
		const map = getStageLabelMap(project.projectType);
		return map[stage] || stage;
	}, [project?.generationStage, project?.projectType]);

	useEffect(() => {
		if (!projectId || quotaBlocked) return;

		let stopped = false;

		async function fetchProject() {
			try {
				const res = await fetch(`/api/projects/${projectId}`, {
					cache: "no-store",
				});
				const json = (await res.json()) as ProjectResponse;
				if (!res.ok || !json.success || !json.data) {
					throw new Error(
						json.error || "프로젝트를 불러오지 못했습니다.",
					);
				}
				if (stopped) return;
				setProject(json.data);
				setError("");
			} catch (err) {
				if (stopped) return;
				setError(
					err instanceof Error
						? err.message
						: "진행 상태를 불러오는 중 오류가 발생했습니다.",
				);
			}
		}

		void fetchProject();
		const interval = setInterval(fetchProject, 1500);
		return () => {
			stopped = true;
			clearInterval(interval);
		};
	}, [projectId]);

	useEffect(() => {
		if (!projectId || startedRef.current || quotaBlocked) return;
		if (!project) return;
		if (project.status === "PUBLISHED") {
			router.replace(`/view/${project.id}`);
			return;
		}
		// 이미 생성이 진행 중이면 POST 요청 보내지 않음
		if (
			project.generationStage &&
			project.generationStage !== "QUEUED" &&
			!(project.generationStage === "FAILED" && retryPending)
		) {
			return;
		}

		// QUEUED 상태이거나 사용자가 명시적으로 재시도 버튼을 누른 경우에만 생성 시작
		if (
			!project.generationStage ||
			project.generationStage === "QUEUED" ||
			(project.generationStage === "FAILED" && retryPending)
		) {
			startedRef.current = true;
			setStarting(true);
			const body = {
				storyModel: searchParams.get("storyModel") || undefined,
				imageModel: searchParams.get("imageModel") || undefined,
			};

			fetch(`/api/projects/${projectId}/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})
				.then(async (res) => {
					const json = (await res.json()) as ProjectResponse;
					if (!res.ok || !json.success) {
						if (
							json.errorCode === "OPENAI_QUOTA_EXCEEDED" ||
							isQuotaError(json.error)
						) {
							handleQuotaBlockedWarning(json.error);
							return;
						}
						throw new Error(
							json.error || "생성 시작에 실패했습니다.",
						);
					}
				})
				.catch((err: unknown) => {
					if (err instanceof Error && isQuotaError(err.message)) {
						handleQuotaBlockedWarning(err.message);
						return;
					}
					setError(
						err instanceof Error
							? err.message
							: "생성 시작 중 오류가 발생했습니다.",
					);
					startedRef.current = false;
				})
				.finally(() => setStarting(false));
		}
	}, [projectId, project, quotaBlocked, retryPending, router, searchParams]);

	useEffect(() => {
		if (!project) return;
		if (project.status === "PUBLISHED") {
			router.replace(`/view/${project.id}`);
		}
	}, [project, router]);

	const progress = normalizeProgress(project?.generationProgress);
	const isFailed = project?.generationStage === "FAILED";

	return (
		<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
			<div className="w-full max-w-xl bg-zinc-900 rounded-2xl border border-white/[0.08] shadow-xl p-8 space-y-5">
				<div className="text-center">
					<p className="text-xs text-violet-400 font-semibold tracking-wide mb-2">
						AI BOOK BUILD
					</p>
					<h1 className="text-2xl font-bold text-white">
						생성 진행 상황
					</h1>
					<p className="text-sm text-zinc-400 mt-2">
						작업 완료 후 자동으로 뷰 페이지로 이동합니다.
					</p>
				</div>

				{project ? (
					<div className="rounded-xl border border-white/[0.08] bg-zinc-800 p-4 text-sm text-zinc-300 space-y-1.5">
						<p>
							<span className="font-semibold">제목:</span>{" "}
							{project.title}
						</p>
						<p>
							<span className="font-semibold">형식:</span>{" "}
							{project.projectType === "COMIC"
								? "만화책"
								: project.projectType === "NOVEL"
									? "소설"
									: project.projectType}
						</p>
						{project.genre ? (
							<p>
								<span className="font-semibold">장르:</span>{" "}
								{project.genre}
							</p>
						) : null}
						{project.storyCharacters ? (
							<p>
								<span className="font-semibold">등장인물:</span>{" "}
								{project.storyCharacters}
							</p>
						) : null}
						{project.requestedPageCount ? (
							<p>
								<span className="font-semibold">
									페이지 수:
								</span>{" "}
								{project.requestedPageCount}쪽
							</p>
						) : null}
						{project.projectType === "COMIC" &&
						project.comicStyle ? (
							<p>
								<span className="font-semibold">그림체:</span>{" "}
								{COMIC_STYLE_LABEL[project.comicStyle] ??
									project.comicStyle}
							</p>
						) : null}
					</div>
				) : (
					<div className="text-sm text-zinc-500">
						프로젝트 정보를 불러오는 중...
					</div>
				)}

				<div>
					<div className="flex justify-between text-sm mb-2">
						<span className="text-zinc-400">현재 단계</span>
						<span className="font-semibold text-violet-400">
							{stageLabel}
						</span>
					</div>
					<div className="h-3 bg-zinc-700 rounded-full overflow-hidden">
						<div
							className={`h-full transition-all duration-500 ${
								isFailed ? "bg-red-400" : "bg-violet-500"
							}`}
							style={{ width: `${progress}%` }}
						/>
					</div>
					<p className="text-right text-xs text-zinc-500 mt-1">
						{progress}%
					</p>
				</div>

				{typeof project?.generationCostUsd === "number" && (
					<div className="rounded-xl border border-emerald-800/30 bg-emerald-900/20 px-4 py-3 text-sm">
						<div className="flex items-center justify-between">
							<span className="text-emerald-300 font-semibold">
								누적 AI 비용
							</span>
							<span className="font-mono text-emerald-200 font-bold">
								{formatCostKrw(project.generationCostUsd)}
							</span>
						</div>
						<p className="text-emerald-400 text-xs mt-1">
							{isFailed
								? "생성 실패 시점까지의 실제 사용 비용입니다."
								: project.status === "PUBLISHED"
									? "최종 실제 청구 비용입니다."
									: "생성 진행에 따라 실시간으로 갱신됩니다."}
						</p>
					</div>
				)}

				{starting ? (
					<p className="text-xs text-zinc-500">
						생성 작업을 시작하는 중입니다...
					</p>
				) : null}

				{(error || project?.generationError) && (
					<div className="rounded-lg border border-red-800/30 bg-red-900/20 text-red-400 text-sm p-3 space-y-3">
						<p className="font-semibold">
							생성 중 오류가 발생했습니다.
						</p>
						<p className="text-xs text-red-400 break-all">
							{error || project?.generationError}
						</p>
						<div className="flex gap-3 pt-1">
							<button
								type="button"
								onClick={() => {
									startedRef.current = false;
									setError("");
									setRetryPending(true);
								}}
								className="flex-1 rounded-lg bg-red-600 text-white text-xs font-semibold py-2 hover:bg-red-700 transition-colors"
							>
								재시도
							</button>
							<button
								type="button"
								onClick={() => router.replace("/")}
								className="flex-1 rounded-lg border border-red-800/40 text-red-400 text-xs font-semibold py-2 hover:bg-red-900/30 transition-colors"
							>
								취소
							</button>
						</div>
					</div>
				)}

				<div className="text-center pt-2">
					<button
						onClick={() => {
							router.push("/");
							router.refresh();
						}}
						className="text-sm text-violet-400 hover:underline"
					>
						홈으로
					</button>
				</div>
			</div>
		</div>
	);
}
