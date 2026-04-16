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

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}초`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

function computeEtaSec(
	samples: Array<{ t: number; p: number }>,
	currentP: number,
): number | null {
	if (samples.length < 2) return null;
	const first = samples[0];
	const last = samples[samples.length - 1];
	const deltaP = last.p - first.p;
	const deltaT = last.t - first.t;
	if (deltaP <= 0 || deltaT <= 0) return null;
	const msPerPercent = deltaT / deltaP;
	const remaining = 100 - currentP;
	if (remaining <= 0) return 0;
	return Math.round((remaining * msPerPercent) / 1000);
}

function getStageLabelMap(projectType: "COMIC" | "NOVEL" | "PHOTOBOOK") {
	return projectType === "NOVEL" ? STAGE_LABEL_NOVEL : STAGE_LABEL_COMIC;
}

function normalizeProgress(value: number | null | undefined) {
	if (typeof value !== "number") return 0;
	return Math.max(0, Math.min(100, value));
}

/** 클라이언트 측 stuck 판단 임계값 (서버 STUCK_THRESHOLD_MS와 동일) */
const STUCK_THRESHOLD_CLIENT_MS = 5 * 60 * 1000;

const ACTIVE_CLIENT_STAGES = [
	"PLANNING",
	"WRITING",
	"SAVING",
	"PUBLISHING",
	"IMAGING",
];

function isActiveClientStage(stage: string | null | undefined): boolean {
	if (!stage) return false;
	return ACTIVE_CLIENT_STAGES.some((s) => stage.startsWith(s));
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
	const [stuckDetected, setStuckDetected] = useState(false);
	const startedRef = useRef(false);
	const quotaAlertedRef = useRef(false);
	const lastStageRef = useRef<string | null | undefined>(undefined);
	const lastStageTimeRef = useRef<number>(0);
	const [elapsedSec, setElapsedSec] = useState(0);
	const [etaSec, setEtaSec] = useState<number | null>(null);
	const progressSamplesRef = useRef<Array<{ t: number; p: number }>>([]);
	const imagingPageMsRef = useRef<number[]>([]);
	const lastImagingDoneRef = useRef<number>(-1);
	const lastImagingDoneTimeRef = useRef<number | null>(null);

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

				// ── 타이밍 추적 ─────────────────────────────────────────────
				{
					const stageNow = json.data.generationStage;
					const progNow = json.data.generationProgress ?? 0;
					const storageKey = projectId
						? `sb_gen_start_${projectId}`
						: null;
					if (
						storageKey &&
						isActiveClientStage(stageNow) &&
						!sessionStorage.getItem(storageKey)
					) {
						sessionStorage.setItem(storageKey, String(Date.now()));
					}
					if (storageKey && stageNow === "COMPLETED") {
						sessionStorage.removeItem(storageKey);
					}
					if (isActiveClientStage(stageNow) && progNow > 0) {
						const now = Date.now();
						const samples = progressSamplesRef.current;
						const lastSample = samples[samples.length - 1];
						if (!lastSample || lastSample.p !== progNow) {
							samples.push({ t: now, p: progNow });
							if (samples.length > 8) samples.shift();
						}
						if (stageNow?.startsWith("IMAGING:")) {
							const parts = stageNow.split(":");
							const done = Number(parts[1]);
							const total = Number(parts[2]);
							if (lastImagingDoneRef.current < 0) {
								lastImagingDoneRef.current = done;
								lastImagingDoneTimeRef.current = now;
							} else if (done > lastImagingDoneRef.current) {
								if (lastImagingDoneTimeRef.current !== null) {
									const perMs =
										(now - lastImagingDoneTimeRef.current) /
										(done - lastImagingDoneRef.current);
									imagingPageMsRef.current.push(perMs);
									if (imagingPageMsRef.current.length > 5)
										imagingPageMsRef.current.shift();
								}
								lastImagingDoneRef.current = done;
								lastImagingDoneTimeRef.current = now;
							}
							const remaining = total - done;
							if (
								imagingPageMsRef.current.length > 0 &&
								remaining >= 0
							) {
								const avgMs =
									imagingPageMsRef.current.reduce(
										(a, b) => a + b,
										0,
									) / imagingPageMsRef.current.length;
								setEtaSec(
									Math.round((remaining * avgMs) / 1000),
								);
							} else if (samples.length >= 3) {
								setEtaSec(computeEtaSec(samples, progNow));
							}
						} else if (samples.length >= 3) {
							setEtaSec(computeEtaSec(samples, progNow));
						}
					}
				}

				// stuck 감지: 활성 스테이지가 5분 이상 변경 없으면 서버 함수가
				// 강제 종료된 것으로 판단하고 자동 재개 트리거
				const stage = json.data.generationStage;
				if (stage !== lastStageRef.current) {
					lastStageRef.current = stage;
					lastStageTimeRef.current = Date.now();
				} else if (
					isActiveClientStage(stage) &&
					lastStageTimeRef.current > 0 &&
					Date.now() - lastStageTimeRef.current >
						STUCK_THRESHOLD_CLIENT_MS
				) {
					setStuckDetected(true);
				}
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

	// stuck 감지 시 자동으로 /generate 콜 (resume 경로)
	useEffect(() => {
		if (!stuckDetected || !projectId || starting || quotaBlocked) return;

		startedRef.current = false;
		setStuckDetected(false);
		setStarting(true);
		setError("");

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
					setError(json.error || "재개 요청에 실패했습니다.");
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
						: "생성 재개 중 오류가 발생했습니다.",
				);
			})
			.finally(() => setStarting(false));
	}, [stuckDetected, projectId, starting, quotaBlocked, searchParams]);

	// ── 경과 시간 타이머 ──────────────────────────────────────────
	useEffect(() => {
		if (!projectId) return;
		const storageKey = `sb_gen_start_${projectId}`;
		const tick = () => {
			const savedStr = sessionStorage.getItem(storageKey);
			if (!savedStr) return;
			const startedAt = Number(savedStr);
			if (!startedAt) return;
			setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [projectId]);

	const progress = normalizeProgress(project?.generationProgress);
	const isFailed = project?.generationStage === "FAILED";
	const isStuck = stuckDetected;

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
					<div className="flex justify-between items-center text-xs text-zinc-500 mt-1">
						<span>
							{elapsedSec > 0 && !isFailed
								? `⏱ ${formatDuration(elapsedSec)}`
								: ""}
						</span>
						<span className="flex items-center gap-2">
							{etaSec !== null &&
								!isFailed &&
								etaSec > 0 &&
								elapsedSec > 10 && (
									<span className="text-violet-400/70">
										~{formatDuration(etaSec)} 남음
									</span>
								)}
							<span>{progress}%</span>
						</span>
					</div>
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

				{isStuck && !isFailed && (
					<div className="rounded-lg border border-amber-800/30 bg-amber-900/20 text-amber-400 text-sm p-3">
						생성이 일시 중단됩니다. 자동으로 재개하는 중입니다...
					</div>
				)}

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
									setEtaSec(null);
									setElapsedSec(0);
									progressSamplesRef.current = [];
									imagingPageMsRef.current = [];
									lastImagingDoneRef.current = -1;
									lastImagingDoneTimeRef.current = null;
									if (projectId) {
										sessionStorage.removeItem(
											`sb_gen_start_${projectId}`,
										);
									}
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

				{/* 안내 문구 */}
				<div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 space-y-1.5 text-xs text-zinc-500 leading-relaxed">
					<p>
						💡{" "}
						<span className="text-zinc-400">
							이 페이지를 나가거나 다른 탭으로 이동해도 생성은
							서버에서 계속 진행됩니다.
						</span>
					</p>
					<p>
						⚠️{" "}
						<span className="text-zinc-400">
							redeploy 등으로 서버 함수가 중단되면{" "}
							<span className="text-amber-400">
								5분 후 자동으로 진행상황을 이어서 재개합니다.
							</span>{" "}
							소설은 왜료 중단된 페이지부터 이어서 직필됩니다.
						</span>
					</p>
				</div>
			</div>
		</div>
	);
}
