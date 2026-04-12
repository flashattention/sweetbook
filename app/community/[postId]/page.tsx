"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

type Page = {
	id: string;
	pageOrder: number;
	imageUrl: string | null;
	caption: string | null;
};

type CommentData = {
	id: string;
	content: string;
	createdAt: string;
	user: { id: string; name: string | null };
	_count: { likes: number };
	likedByMe: boolean;
	replies: CommentData[];
};

type PostDetail = {
	id: string;
	description: string | null;
	projectType: string;
	createdAt: string;
	user: { id: string; name: string | null };
	project: {
		title: string;
		coverImageUrl: string | null;
		genre: string | null;
		synopsis: string | null;
		comicStyle: string | null;
		pages: Page[];
	};
	_count: { likes: number; comments: number };
	likedByMe: boolean;
};

const TYPE_MAP: Record<string, { label: string; color: string }> = {
	COMIC: { label: "만화책", color: "bg-violet-100 text-violet-700" },
	NOVEL: { label: "소설", color: "bg-blue-100 text-blue-700" },
};

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("ko-KR", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function CommentItem({
	comment,
	currentUserId,
	postId,
	onReplySubmit,
	onDelete,
	onLike,
	depth,
}: {
	comment: CommentData;
	currentUserId: string | null;
	postId: string;
	onReplySubmit: (content: string, parentId: string) => Promise<void>;
	onDelete: (commentId: string) => Promise<void>;
	onLike: (commentId: string) => void;
	depth: number;
}) {
	const [showReplyForm, setShowReplyForm] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function handleReply() {
		if (!replyText.trim()) return;
		setSubmitting(true);
		await onReplySubmit(replyText.trim(), comment.id);
		setReplyText("");
		setShowReplyForm(false);
		setSubmitting(false);
	}

	return (
		<div
			className={`${depth > 0 ? "ml-8 border-l-2 border-white/[0.07] pl-4" : ""}`}
		>
			<div className="py-3">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 bg-violet-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
							{(comment.user.name ?? "?")[0].toUpperCase()}
						</div>
						<span className="text-sm font-semibold text-white/80">
							{comment.user.name ?? "익명"}
						</span>
						<span className="text-xs text-white/30">
							{formatDate(comment.createdAt)}
						</span>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<button
							onClick={() => onLike(comment.id)}
							className={`flex items-center gap-1 text-xs transition-colors ${
								comment.likedByMe
									? "text-violet-400"
									: "text-white/30 hover:text-violet-400"
							}`}
						>
							<span>{comment.likedByMe ? "♥" : "♡"}</span>
							<span>{comment._count.likes}</span>
						</button>
						{currentUserId === comment.user.id && (
							<button
								onClick={() => onDelete(comment.id)}
								className="text-xs text-white/20 hover:text-red-400 transition-colors"
							>
								삭제
							</button>
						)}
					</div>
				</div>
				<p className="mt-2 text-sm text-white/60 leading-relaxed ml-9">
					{comment.content}
				</p>

				{/* 답글 버튼 (2단계만 허용) */}
				{depth === 0 && currentUserId && (
					<button
						onClick={() => setShowReplyForm((v) => !v)}
						className="ml-9 mt-1 text-xs text-white/30 hover:text-violet-400 transition-colors"
					>
						{showReplyForm ? "취소" : "답글 달기"}
					</button>
				)}

				{showReplyForm && (
					<div className="ml-9 mt-2 flex gap-2">
						<input
							type="text"
							value={replyText}
							onChange={(e) => setReplyText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleReply();
								}
							}}
							placeholder="답글을 입력하세요..."
							maxLength={500}
							className="flex-1 text-sm px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
						/>
						<button
							onClick={handleReply}
							disabled={submitting || !replyText.trim()}
							className="px-3 py-2 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-colors"
						>
							{submitting ? "..." : "등록"}
						</button>
					</div>
				)}
			</div>

			{/* 대댓글 */}
			{comment.replies.map((reply) => (
				<CommentItem
					key={reply.id}
					comment={reply}
					currentUserId={currentUserId}
					postId={postId}
					onReplySubmit={onReplySubmit}
					onDelete={onDelete}
					onLike={onLike}
					depth={depth + 1}
				/>
			))}
		</div>
	);
}

export default function PostDetailPage() {
	const params = useParams<{ postId: string }>();
	const router = useRouter();
	const postId = params.postId;

	const [post, setPost] = useState<PostDetail | null>(null);
	const [comments, setComments] = useState<CommentData[]>([]);
	const [loading, setLoading] = useState(true);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [newComment, setNewComment] = useState("");
	const [submittingComment, setSubmittingComment] = useState(false);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => r.json())
			.then((d) => {
				if (d.success && d.data) setCurrentUserId(d.data.id);
				// 비로그인이라도 상세페이지 보여줌
			});
	}, []);

	useEffect(() => {
		if (!postId) return;
		Promise.all([
			fetch(`/api/community/${postId}`).then((r) => r.json()),
			fetch(`/api/community/${postId}/comments`).then((r) => r.json()),
		]).then(([postData, commentsData]) => {
			if (!postData.success) {
				router.push("/community");
				return;
			}
			setPost(postData.data);
			if (commentsData.success) setComments(commentsData.data);
			setLoading(false);
		});
	}, [postId, router]);

	async function handleLike() {
		if (!post) return;
		if (!currentUserId) {
			router.push(`/login?next=/community/${postId}`);
			return;
		}
		const res = await fetch(`/api/community/${postId}/like`, {
			method: "POST",
		});
		if (!res.ok) return;
		const { liked, count } = await res.json();
		setPost((p) =>
			p
				? {
						...p,
						likedByMe: liked,
						_count: { ...p._count, likes: count },
					}
				: p,
		);
	}

	async function handleDelete() {
		if (!post || !confirm("이 게시글을 삭제하시겠습니까?")) return;
		setDeleting(true);
		const res = await fetch(`/api/community/${postId}`, {
			method: "DELETE",
		});
		if (res.ok) {
			router.push("/community");
		} else {
			setDeleting(false);
		}
	}

	async function handleCommentSubmit() {
		if (!newComment.trim()) return;
		if (!currentUserId) {
			router.push(`/login?next=/community/${postId}`);
			return;
		}
		setSubmittingComment(true);
		const res = await fetch(`/api/community/${postId}/comments`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: newComment.trim() }),
		});
		const data = await res.json();
		setSubmittingComment(false);
		if (!data.success) return;
		setComments((prev) => [...prev, { ...data.data, replies: [] }]);
		setNewComment("");
		setPost((p) =>
			p
				? {
						...p,
						_count: {
							...p._count,
							comments: p._count.comments + 1,
						},
					}
				: p,
		);
	}

	async function handleReplySubmit(content: string, parentId: string) {
		const res = await fetch(`/api/community/${postId}/comments`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content, parentId }),
		});
		const data = await res.json();
		if (!data.success) return;
		setComments((prev) =>
			prev.map((c) =>
				c.id === parentId
					? {
							...c,
							replies: [
								...c.replies,
								{ ...data.data, replies: [] },
							],
						}
					: c,
			),
		);
		setPost((p) =>
			p
				? {
						...p,
						_count: {
							...p._count,
							comments: p._count.comments + 1,
						},
					}
				: p,
		);
	}

	async function handleCommentDelete(commentId: string) {
		if (!confirm("댓글을 삭제하시겠습니까?")) return;
		const res = await fetch(
			`/api/community/${postId}/comments/${commentId}`,
			{ method: "DELETE" },
		);
		if (!res.ok) return;
		// 최상위 댓글 또는 대댓글 찾아서 제거
		setComments((prev) => {
			const filtered = prev.filter((c) => c.id !== commentId);
			return filtered.map((c) => ({
				...c,
				replies: c.replies.filter((r) => r.id !== commentId),
			}));
		});
		setPost((p) =>
			p
				? {
						...p,
						_count: {
							...p._count,
							comments: Math.max(0, p._count.comments - 1),
						},
					}
				: p,
		);
	}

	async function handleCommentLike(commentId: string) {
		if (!currentUserId) {
			router.push(`/login?next=/community/${postId}`);
			return;
		}
		const res = await fetch(
			`/api/community/${postId}/comments/${commentId}/like`,
			{ method: "POST" },
		);
		if (!res.ok) return;
		const { liked, count } = await res.json();

		function updateComment(c: CommentData): CommentData {
			if (c.id === commentId) {
				return {
					...c,
					likedByMe: liked,
					_count: { ...c._count, likes: count },
				};
			}
			return { ...c, replies: c.replies.map(updateComment) };
		}
		setComments((prev) => prev.map(updateComment));
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center">
				<div className="text-white/40">불러오는 중...</div>
			</div>
		);
	}
	if (!post) return null;

	const type = TYPE_MAP[post.projectType] ?? {
		label: post.projectType,
		color: "bg-gray-100 text-gray-700",
	};
	const pages = post.project.pages;

	return (
		<div className="min-h-screen bg-zinc-950 text-white">
			{/* 헤더 */}
			<header className="bg-zinc-950 border-b border-white/[0.08] sticky top-0 z-40">
				<div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
					<Link
						href="/community"
						className="text-sm text-white/50 hover:text-white transition-colors"
					>
						← 커뮤니티
					</Link>
					{currentUserId === post.user.id && (
						<button
							onClick={handleDelete}
							disabled={deleting}
							className="text-sm text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-60"
						>
							{deleting ? "삭제 중..." : "게시글 삭제"}
						</button>
					)}
				</div>
			</header>

			<main>
				{/* ── 작품 정보 ── */}
				<section className="max-w-3xl mx-auto px-4 py-10">
					<div className="flex items-center gap-2 mb-4">
						<span
							className={`text-xs font-bold px-3 py-1 rounded-full ${
								post.projectType === "COMIC"
									? "bg-violet-900/60 text-violet-300"
									: "bg-blue-900/60 text-blue-300"
							}`}
						>
							{type.label}
						</span>
						{post.project.genre && (
							<span className="text-xs px-3 py-1 rounded-full bg-white/[0.07] text-white/50">
								{post.project.genre}
							</span>
						)}
					</div>

					<h1 className="text-2xl font-bold text-white mb-3">
						{post.project.title}
					</h1>

					<div className="flex items-center gap-2 mb-5 text-sm text-white/40">
						<div className="w-6 h-6 bg-violet-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
							{(post.user.name ?? "?")[0].toUpperCase()}
						</div>
						<span className="text-white/60">
							{post.user.name ?? "익명"}
						</span>
						<span>·</span>
						<span>{formatDate(post.createdAt)}</span>
						<span>·</span>
						<span>💬 {post._count.comments}</span>
						<span>·</span>
						<span>{pages.length}페이지</span>
					</div>

					{post.description && (
						<div className="bg-white/[0.05] rounded-xl border border-white/[0.07] p-4 mb-4">
							<p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
								{post.description}
							</p>
						</div>
					)}

					{post.project.synopsis && (
						<div className="mb-5">
							<p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-2">
								줄거리
							</p>
							<p className="text-white/50 text-sm leading-relaxed whitespace-pre-wrap">
								{post.project.synopsis}
							</p>
						</div>
					)}

					{/* 좋아요 버튼 */}
					<button
						onClick={handleLike}
						className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
							post.likedByMe
								? "bg-violet-600 text-white"
								: "bg-white/[0.07] text-white/60 border border-white/[0.1] hover:bg-white/[0.12] hover:text-white"
						}`}
					>
						<span>{post.likedByMe ? "♥" : "♡"}</span>
						<span>{post.likedByMe ? "좋아요 취소" : "좋아요"}</span>
						<span className="font-bold">{post._count.likes}</span>
					</button>
				</section>

				{/* ── 웹툰 스크롤 뷰어 (COMIC) ── */}
				{post.projectType === "COMIC" && pages.length > 0 && (
					<section className="border-t border-white/[0.06] bg-black">
						<div className="max-w-[720px] mx-auto">
							{pages.map((page) => (
								<div key={page.id} className="w-full">
									{page.imageUrl ? (
										<img
											src={page.imageUrl}
											alt={`${page.pageOrder}화`}
											className="w-full h-auto block"
										/>
									) : (
										<div className="w-full aspect-[3/4] bg-zinc-900 flex items-center justify-center text-white/20 text-sm">
											이미지 없음
										</div>
									)}
									{page.caption && (
										<div className="bg-black px-6 py-3 text-center">
											<p className="text-white/50 text-sm leading-relaxed">
												{page.caption}
											</p>
										</div>
									)}
								</div>
							))}
							<div className="py-6 text-center text-white/20 text-xs border-t border-white/[0.06]">
								끝 · 총 {pages.length}화
							</div>
						</div>
					</section>
				)}

				{/* ── 소설 스크롤 뷰어 (NOVEL) ── */}
				{post.projectType === "NOVEL" && pages.length > 0 && (
					<section className="border-t border-white/[0.06]">
						<div className="max-w-[680px] mx-auto px-6 py-12 space-y-14">
							{pages.map((page) => (
								<div key={page.id}>
									<p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-5">
										{page.pageOrder}페이지
									</p>
									{page.caption ? (
										<p className="text-white/75 text-[17px] leading-[1.9] whitespace-pre-wrap tracking-wide">
											{page.caption}
										</p>
									) : (
										<p className="text-white/20 text-sm italic">
											내용 없음
										</p>
									)}
									{page.imageUrl && (
										<img
											src={page.imageUrl}
											alt={`${page.pageOrder}페이지 삽화`}
											className="mt-6 w-full h-auto rounded-xl"
										/>
									)}
									{page.pageOrder < pages.length && (
										<div className="mt-14 border-t border-white/[0.06]" />
									)}
								</div>
							))}
							<p className="text-center text-white/20 text-xs pt-4 border-t border-white/[0.06]">
								끝 · 총 {pages.length}페이지
							</p>
						</div>
					</section>
				)}

				{/* ── 콘텐츠 끝 좋아요 ── */}
				<section className="py-16 flex flex-col items-center gap-4">
					<p className="text-white/30 text-sm">
						작품이 마음에 드셨나요?
					</p>
					<button
						onClick={handleLike}
						className={`inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-200 ${
							post.likedByMe
								? "bg-violet-600 text-white shadow-lg shadow-violet-900/50 scale-105"
								: "bg-white/[0.07] text-white/60 border border-white/[0.12] hover:bg-violet-600/20 hover:text-white hover:border-violet-500/40 hover:scale-105"
						}`}
					>
						<span className="text-2xl">
							{post.likedByMe ? "♥" : "♡"}
						</span>
						<span>{post.likedByMe ? "좋아요 취소" : "좋아요"}</span>
						<span className="bg-white/10 rounded-lg px-2.5 py-0.5 text-base font-bold">
							{post._count.likes}
						</span>
					</button>
				</section>

				{/* ── 댓글 ── */}
				<section className="border-t border-white/[0.06] max-w-3xl mx-auto px-4 py-12">
					<h2 className="text-base font-bold text-white mb-6">
						댓글
						{post._count.comments > 0
							? ` (${post._count.comments})`
							: ""}
					</h2>

					{/* 댓글 입력 */}
					<div className="flex gap-3 mb-8">
						<div className="w-8 h-8 bg-violet-700 rounded-full flex-shrink-0" />
						<div className="flex-1 flex gap-2">
							<input
								type="text"
								value={newComment}
								onChange={(e) => setNewComment(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleCommentSubmit();
									}
								}}
								placeholder="댓글을 입력하세요..."
								maxLength={500}
								className="flex-1 text-sm px-4 py-2.5 bg-white/[0.06] border border-white/[0.1] rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
							/>
							<button
								onClick={handleCommentSubmit}
								disabled={
									submittingComment || !newComment.trim()
								}
								className="px-4 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-colors"
							>
								{submittingComment ? "..." : "등록"}
							</button>
						</div>
					</div>

					{/* 댓글 목록 */}
					{comments.length === 0 ? (
						<p className="text-center text-white/30 py-8 text-sm">
							첫 댓글을 남겨보세요!
						</p>
					) : (
						<div className="divide-y divide-white/[0.05]">
							{comments.map((comment) => (
								<CommentItem
									key={comment.id}
									comment={comment}
									currentUserId={currentUserId}
									postId={postId}
									onReplySubmit={handleReplySubmit}
									onDelete={handleCommentDelete}
									onLike={handleCommentLike}
									depth={0}
								/>
							))}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
