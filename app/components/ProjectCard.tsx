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
	DRAFT: { label: "편집 중", color: "bg-amber-100 text-amber-700" },
	GENERATING: { label: "생성 중", color: "bg-blue-100 text-blue-700" },
	PUBLISHED: { label: "출판됨", color: "bg-green-100 text-green-700" },
	ORDERED: { label: "주문됨", color: "bg-purple-100 text-purple-700" },
	FAILED: { label: "오류", color: "bg-red-100 text-red-700" },
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
				className="text-xs bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-100 transition-colors"
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
				className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 transition-colors"
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
					className="text-xs bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-100 transition-colors"
				>
					📖 보기
				</Link>
				<button
					type="button"
					onClick={() => void onRetryPublish()}
					disabled={isPublishing}
					className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
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
					className="text-xs bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-100 transition-colors"
				>
					📖 보기
				</Link>
				<Link
					href={`/status/${project.orderUid}`}
					className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition-colors"
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
					className="text-xs bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-100 transition-colors"
				>
					📖 보기
				</Link>
				<Link
					href={`/order/${project.id}`}
					className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors"
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
				className="text-xs bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-100 transition-colors"
			>
				편집하기 →
			</Link>
		);
	}
	// 스토리 초안(아직 생성 안 함)
	return (
		<Link
			href={`/create/progress/${project.id}`}
			className="text-xs bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg font-medium hover:bg-violet-100 transition-colors"
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

	return (
		<>
			<div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden hover:shadow-md transition-shadow">
				{/* 표지 이미지 */}
				<div className="relative h-44 bg-rose-50">
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
					<span className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/90 text-gray-700">
						{TYPE_MAP[project.projectType] || "프로젝트"}
					</span>
					{project.isDefault && (
						<span className="absolute bottom-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/90 text-white">
							샘플
						</span>
					)}
				</div>

				{/* 정보 */}
				<div className="flex flex-col flex-1 p-4">
					<h3 className="font-bold text-gray-800 text-base mb-1 truncate">
						{project.title}
					</h3>
					{project.storyCharacters && (
						<p className="text-gray-500 text-sm mb-1 truncate">
							{project.storyCharacters}
						</p>
					)}
					<p className="text-rose-400 text-xs mb-4">
						{project.genre ? project.genre : `${createdLabel} 생성`}
					</p>
					<div className="flex items-center justify-between">
						<span className="text-gray-400 text-xs">
							{project.pages.length}쪽
						</span>
					</div>

					{/* 공유 완료 배너 */}
					{sharedPostId && (
						<Link
							href={`/community/${sharedPostId}`}
							className="block text-center text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 mt-2 hover:bg-green-100 transition-colors"
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
						{!project.isDefault && (
							<button
								onClick={() => setShowDeleteConfirm(true)}
								disabled={
									isDeleting || isPublishing || isSharing
								}
								className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
							>
								삭제
							</button>
						)}
					</div>
				</div>
			</div>

			{/* 삭제 확인 모달 */}
			{showDeleteConfirm && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full mx-4">
						<h2 className="font-bold text-gray-800 mb-2">
							프로젝트 삭제
						</h2>
						<p className="text-gray-600 text-sm mb-6">
							정말 "{project.title}"을(를) 삭제하시겠습니까?
							<br />이 작업은 되돌릴 수 없습니다.
						</p>
						<div className="flex gap-3 justify-end">
							<button
								onClick={() => setShowDeleteConfirm(false)}
								disabled={isDeleting}
								className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
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
