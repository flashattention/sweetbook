"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";

interface ProjectCardProps {
	project: Project;
	onDelete?: () => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
	DRAFT: { label: "편집 중", color: "bg-amber-900/60 text-amber-300" },
	GENERATING: { label: "생성 중", color: "bg-blue-900/60 text-blue-300" },
	PUBLISHED: { label: "출판됨", color: "bg-green-900/60 text-green-300" },
	ORDERED: { label: "주문됨", color: "bg-purple-900/60 text-purple-300" },
	FAILED: { label: "오류", color: "bg-red-900/60 text-red-300" },
};

const TYPE_MAP: Record<string, string> = {
	PHOTOBOOK: "포토북",
	COMIC: "만화책",
	NOVEL: "소설",
};

function getProjectStatus(project: Project): string {
	if (project.status === "PUBLISHED") return "PUBLISHED";
	if (project.status === "ORDERED") return "ORDERED";
	if (
		project.status === "DRAFT" &&
		project.generationStage &&
		project.generationStage !== "FAILED"
	) {
		return "GENERATING";
	}
	if (project.generationStage === "FAILED") return "FAILED";
	return "DRAFT";
}

function ProjectActionWithHandlers({
	project,
	isPublishing,
	onRetryPublish,
}: {
	project: Project;
	isPublishing: boolean;
	onRetryPublish: () => Promise<void> | void;
}) {
	// 생성 중 → 진행 페이지
	if (
		project.status === "DRAFT" &&
		project.generationStage &&
		project.generationStage !== "COMPLETED" &&
		project.generationStage !== "FAILED"
	) {
		return (
			<Link
				href={`/create/progress/${project.id}`}
				className="text-xs bg-violet-900/50 text-violet-300 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-800/60 transition-colors"
			>
				생성 현황 보기 →
			</Link>
		);
	}
	// 생성 실패 → 재시도
	if (project.status === "DRAFT" && project.generationStage === "FAILED") {
		return (
			<Link
				href={`/create/progress/${project.id}`}
				className="text-xs bg-red-900/50 text-red-300 px-3 py-1.5 rounded-lg font-medium hover:bg-red-800/60 transition-colors"
			>
				재시도 →
			</Link>
		);
	}
	// 출판 상태이지만 bookUid가 없는 비정상 상태 → 출판 재시도
	if (project.status === "PUBLISHED" && !project.bookUid) {
		return (
			<div className="flex gap-2">
				<Link
					href={`/view/${project.id}`}
					className="text-xs bg-rose-900/50 text-rose-300 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-800/60 transition-colors"
				>
					📖 보기
				</Link>
				<button
					type="button"
					onClick={() => void onRetryPublish()}
					disabled={isPublishing}
					className="text-xs bg-blue-900/50 text-blue-300 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-800/60 transition-colors disabled:opacity-50"
				>
					{isPublishing ? "출판 재시도 중..." : "출판 재시도 →"}
				</button>
			</div>
		);
	}
	// 주문 완료
	if (project.status === "ORDERED" && project.orderUid) {
		return (
			<div className="flex gap-2">
				<Link
					href={`/view/${project.id}`}
					className="text-xs bg-rose-900/50 text-rose-300 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-800/60 transition-colors"
				>
					📖 보기
				</Link>
				<Link
					href={`/status/${project.orderUid}`}
					className="text-xs bg-green-900/50 text-green-300 px-3 py-1.5 rounded-lg font-medium hover:bg-green-800/60 transition-colors"
				>
					배송 현황 →
				</Link>
			</div>
		);
	}
	// 출판 완료(Sweetbook 등록) 또는 AI 생성 완료(스토리) → 주문하기
	if (project.status === "PUBLISHED") {
		return (
			<div className="flex gap-2">
				<Link
					href={`/view/${project.id}`}
					className="text-xs bg-rose-900/50 text-rose-300 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-800/60 transition-colors"
				>
					📖 보기
				</Link>
				<Link
					href={`/order/${project.id}`}
					className="text-xs bg-blue-900/50 text-blue-300 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-800/60 transition-colors"
				>
					주문하기 →
				</Link>
			</div>
		);
	}
	// 포토북 편집 중
	if (project.projectType === "PHOTOBOOK") {
		return (
			<Link
				href={`/editor/${project.id}`}
				className="text-xs bg-rose-900/50 text-rose-300 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-800/60 transition-colors"
			>
				편집하기 →
			</Link>
		);
	}
	// 스토리 초안(아직 생성 안 함)
	return (
		<Link
			href={`/create/progress/${project.id}`}
			className="text-xs bg-violet-900/50 text-violet-300 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-800/60 transition-colors"
		>
			생성 시작 →
		</Link>
	);
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
	const router = useRouter();
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isPublishing, setIsPublishing] = useState(false);
	const [isSharing, setIsSharing] = useState(false);
	const [sharedPostId, setSharedPostId] = useState<string | null>(null);
	const [holo, setHolo] = useState({ x: 0.5, y: 0.5, active: false });

	const status = STATUS_MAP[getProjectStatus(project)] ?? STATUS_MAP.DRAFT;
	const coverImage =
		project.coverImageUrl ||
		project.pages[0]?.imageUrl ||
		`https://picsum.photos/seed/${project.id}/400/300`;
	const createdLabel = new Date(project.createdAt).toLocaleDateString(
		"ko-KR",
		{
			year: "numeric",
			month: "long",
			day: "numeric",
		},
	);

	const handleDelete = async () => {
		if (isDeleting) return;
		setIsDeleting(true);
		try {
			const response = await fetch(`/api/projects/${project.id}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				throw new Error("삭제에 실패했습니다");
			}
			setShowDeleteConfirm(false);
			onDelete?.();
			router.refresh();
		} catch (error) {
			console.error("[ProjectCard] Delete failed:", error);
			alert("삭제에 실패했습니다");
		} finally {
			setIsDeleting(false);
		}
	};

	const handleShare = async () => {
		if (isSharing) return;
		setIsSharing(true);
		try {
			const res = await fetch("/api/community", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId: project.id }),
			});
			const json = await res.json().catch(() => ({}));
			if (res.status === 409) {
				// 이미 공유됨 — 커뮤니티로 이동
				router.push("/community");
				return;
			}
			if (!res.ok || !json.success) {
				alert(json.error ?? "공유에 실패했습니다.");
				return;
			}
			setSharedPostId(json.data.id);
		} finally {
			setIsSharing(false);
		}
	};

	const handleRetryPublish = async () => {
		if (isPublishing) return;
		setIsPublishing(true);
		try {
			const response = await fetch(
				`/api/projects/${project.id}/publish`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				},
			);
			const json = (await response.json().catch(() => ({}))) as {
				success?: boolean;
				error?: string;
			};
			if (!response.ok || !json.success) {
				throw new Error(json.error || "출판 재시도에 실패했습니다.");
			}
			router.refresh();
		} catch (error) {
			console.error("[ProjectCard] Publish retry failed:", error);
			alert(
				error instanceof Error
					? error.message
					: "출판 재시도 중 오류가 발생했습니다.",
			);
		} finally {
			setIsPublishing(false);
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		setHolo({
			x: (e.clientX - rect.left) / rect.width,
			y: (e.clientY - rect.top) / rect.height,
			active: true,
		});
	};

	const handleMouseLeave = () => {
		setHolo((h) => ({ ...h, active: false }));
	};

	const hue = Math.round(holo.x * 360);
	const angle = Math.round((holo.x * 0.6 + holo.y * 0.4) * 360);

	return (
		<>
			<div
				className="relative flex flex-col h-full bg-zinc-900 rounded-2xl border border-white/[0.08] overflow-hidden transition-all duration-300"
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				style={{
					boxShadow: holo.active
						? `0 8px 40px hsla(${hue},80%,60%,0.3), 0 2px 8px rgba(0,0,0,0.6)`
						: "0 2px 8px rgba(0,0,0,0.5)",
				}}
			>
				{/* 홀로그램 오버레이 */}
				<div
					className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-300"
					style={{
						opacity: holo.active ? 1 : 0,
						background: `linear-gradient(${angle}deg, hsla(${hue},100%,65%,0.18), hsla(${(hue + 60) % 360},100%,65%,0.18), hsla(${(hue + 120) % 360},100%,65%,0.18), hsla(${(hue + 180) % 360},100%,65%,0.18), hsla(${(hue + 240) % 360},100%,65%,0.18), hsla(${(hue + 300) % 360},100%,65%,0.18))`,
						mixBlendMode: "overlay",
					}}
				/>
				{/* 표지 이미지 */}
				<div className="relative h-44 bg-zinc-800">
					<Image
						src={coverImage}
						alt={project.title}
						fill
						className="object-cover"
						unoptimized
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
					<span
						className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${status.color}`}
					>
						{status.label}
					</span>
					<span className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-black/60 text-white">
						{TYPE_MAP[project.projectType] || "프로젝트"}
					</span>
				</div>

				<div className="flex flex-col flex-1 p-4">
					<h3 className="font-bold text-white text-base mb-1 truncate">
						{project.title}
					</h3>
					{project.storyCharacters && (
						<p className="text-zinc-400 text-sm mb-1 truncate">
							{project.storyCharacters}
						</p>
					)}
					<p className="text-violet-400 text-xs mb-4">
						{project.genre ? project.genre : `${createdLabel} 생성`}
					</p>
					<div className="flex items-center justify-between">
						<span className="text-zinc-500 text-xs">
							{project.pages.length}쪽
						</span>
					</div>

					{/* 공유 완료 배너 */}
					{sharedPostId && (
						<Link
							href={`/community/${sharedPostId}`}
							className="block text-center text-xs text-green-300 bg-green-900/30 border border-green-800/50 rounded-lg px-3 py-1.5 mt-2 hover:bg-green-900/50 transition-colors"
						>
							🎉 커뮤니티에 공유됨 — 보러가기
						</Link>
					)}

					{/* 버튼 영역 - 항상 아래에 위치 */}
					<div className="mt-auto pt-4 flex items-center justify-between gap-2">
						<div className="flex items-center gap-2 flex-wrap">
							<ProjectActionWithHandlers
								project={project}
								isPublishing={isPublishing}
								onRetryPublish={handleRetryPublish}
							/>
							{project.status === "PUBLISHED" &&
								(project.projectType === "COMIC" ||
									project.projectType === "NOVEL") &&
								!sharedPostId && (
									<button
										onClick={handleShare}
										disabled={isSharing}
										className="text-xs bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-100 transition-colors disabled:opacity-50"
									>
										{isSharing ? "공유 중..." : "🌐 공유"}
									</button>
								)}
						</div>
						<button
							onClick={() => setShowDeleteConfirm(true)}
							disabled={isDeleting || isPublishing || isSharing}
							className="text-xs bg-red-900/40 text-red-400 px-3 py-1.5 rounded-lg font-medium hover:bg-red-900/60 transition-colors disabled:opacity-50"
						>
							삭제
						</button>
					</div>
				</div>
			</div>

			{/* 삭제 확인 모달 */}
			{showDeleteConfirm && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-zinc-900 rounded-2xl border border-white/[0.08] shadow-lg p-6 max-w-sm w-full mx-4">
						<h2 className="font-bold text-white mb-2">
							프로젝트 삭제
						</h2>
						<p className="text-zinc-400 text-sm mb-6">
							정말 "{project.title}"을(를) 삭제하시겠습니까?
							<br />이 작업은 되돌릴 수 없습니다.
						</p>
						<div className="flex gap-3 justify-end">
							<button
								onClick={() => setShowDeleteConfirm(false)}
								disabled={isDeleting}
								className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
							>
								취소
							</button>
							<button
								onClick={handleDelete}
								disabled={isDeleting}
								className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
							>
								{isDeleting ? "삭제 중..." : "삭제"}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
