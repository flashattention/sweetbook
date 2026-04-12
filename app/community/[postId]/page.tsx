"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
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
			className={`${depth > 0 ? "ml-8 border-l-2 border-rose-100 pl-4" : ""}`}
		>
			<div className="py-3">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 bg-gradient-to-br from-rose-300 to-purple-300 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
							{(comment.user.name ?? "?")[0].toUpperCase()}
						</div>
						<span className="text-sm font-semibold text-gray-700">
							{comment.user.name ?? "익명"}
						</span>
						<span className="text-xs text-gray-400">
							{formatDate(comment.createdAt)}
						</span>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<button
							onClick={() => onLike(comment.id)}
							className={`flex items-center gap-1 text-xs transition-colors ${
								comment.likedByMe
									? "text-rose-500"
									: "text-gray-400 hover:text-rose-500"
							}`}
						>
							<span>{comment.likedByMe ? "♥" : "♡"}</span>
							<span>{comment._count.likes}</span>
						</button>
						{currentUserId === comment.user.id && (
							<button
								onClick={() => onDelete(comment.id)}
								className="text-xs text-gray-300 hover:text-red-400 transition-colors"
							>
								삭제
							</button>
						)}
					</div>
				</div>
				<p className="mt-2 text-sm text-gray-700 leading-relaxed ml-9">
					{comment.content}
				</p>

				{/* 답글 버튼 (2단계만 허용) */}
				{depth === 0 && currentUserId && (
					<button
						onClick={() => setShowReplyForm((v) => !v)}
						className="ml-9 mt-1 text-xs text-gray-400 hover:text-rose-500 transition-colors"
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
							className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200"
						/>
						<button
							onClick={handleReply}
							disabled={submitting || !replyText.trim()}
							className="px-3 py-2 bg-rose-500 text-white text-xs font-semibold rounded-xl hover:bg-rose-600 disabled:opacity-60 transition-colors"
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
	const [selectedPage, setSelectedPage] = useState<Page | null>(null);

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
			<div className="min-h-screen bg-gradient-to-b from-rose-50 to-white flex items-center justify-center">
				<div className="text-gray-400">불러오는 중...</div>
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
		<div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
			{/* 헤더 */}
			<header className="bg-white/80 backdrop-blur-sm border-b border-rose-100 sticky top-0 z-40">
				<div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
					<Link
						href="/community"
						className="text-sm text-gray-500 hover:text-rose-600 transition-colors"
					>
						← 커뮤니티
					</Link>
					{currentUserId === post.user.id && (
						<button
							onClick={handleDelete}
							disabled={deleting}
							className="text-sm text-red-400 hover:text-red-600 transition-colors disabled:opacity-60"
						>
							{deleting ? "삭제 중..." : "게시글 삭제"}
						</button>
					)}
				</div>
			</header>

			<main className="max-w-4xl mx-auto px-4 py-8">
				<div className="grid md:grid-cols-[280px,1fr] gap-8">
					{/* 커버 사이드 */}
					<div className="flex-shrink-0">
						<div className="relative aspect-[3/4] rounded-3xl overflow-hidden shadow-lg bg-gradient-to-br from-rose-100 to-purple-100">
							{post.project.coverImageUrl ? (
								<Image
									src={post.project.coverImageUrl}
									alt={post.project.title}
									fill
									className="object-cover"
									sizes="280px"
									priority
								/>
							) : (
								<div className="flex items-center justify-center h-full text-6xl">
									{post.projectType === "COMIC" ? "✍️" : "📚"}
								</div>
							)}
						</div>

						{/* 좋아요 버튼 */}
						<button
							onClick={handleLike}
							className={`mt-4 w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
								post.likedByMe
									? "bg-rose-500 text-white"
									: "bg-white border border-rose-200 text-rose-500 hover:bg-rose-50"
							}`}
						>
							<span className="text-base">
								{post.likedByMe ? "♥" : "♡"}
							</span>
							<span>
								{post.likedByMe ? "좋아요 취소" : "좋아요"}
							</span>
							<span className="font-bold">
								{post._count.likes}
							</span>
						</button>
					</div>

					{/* 내용 */}
					<div>
						<div className="flex items-start gap-3 mb-3">
							<span
								className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${type.color}`}
							>
								{type.label}
							</span>
							{post.project.genre && (
								<span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
									{post.project.genre}
								</span>
							)}
						</div>

						<h1 className="text-2xl font-bold text-gray-900 mb-2">
							{post.project.title}
						</h1>

						<div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
							<div className="w-6 h-6 bg-gradient-to-br from-rose-300 to-purple-300 rounded-full flex items-center justify-center text-white text-xs font-bold">
								{(post.user.name ?? "?")[0].toUpperCase()}
							</div>
							<span>{post.user.name ?? "익명"}</span>
							<span>·</span>
							<span>{formatDate(post.createdAt)}</span>
							<span>·</span>
							<span>💬 {post._count.comments}</span>
						</div>

						{post.description && (
							<div className="bg-white rounded-2xl border border-rose-100 p-4 mb-4">
								<p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
									{post.description}
								</p>
							</div>
						)}

						{post.project.synopsis && (
							<div className="mb-4">
								<h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">
									줄거리
								</h2>
								<p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
									{post.project.synopsis}
								</p>
							</div>
						)}

						<div className="flex items-center gap-4 text-sm text-gray-400">
							<span>{pages.length}페이지</span>
							{post.project.comicStyle && (
								<span>스타일: {post.project.comicStyle}</span>
							)}
						</div>
					</div>
				</div>

				{/* 페이지 갤러리 (COMIC) */}
				{post.projectType === "COMIC" && pages.length > 0 && (
					<section className="mt-12">
						<h2 className="text-lg font-bold text-gray-800 mb-4">
							페이지 미리보기
						</h2>
						<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
							{pages.map((page) => (
								<button
									key={page.id}
									onClick={() => setSelectedPage(page)}
									className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-rose-50 hover:ring-2 hover:ring-rose-400 transition-all"
								>
									{page.imageUrl ? (
										<Image
											src={page.imageUrl}
											alt={`${page.pageOrder}페이지`}
											fill
											className="object-cover group-hover:scale-105 transition-transform"
											sizes="120px"
										/>
									) : (
										<div className="flex items-center justify-center h-full text-2xl">
											🖼
										</div>
									)}
									<div className="absolute bottom-0 inset-x-0 bg-black/30 text-white text-xs py-1 text-center">
										{page.pageOrder}
									</div>
								</button>
							))}
						</div>
					</section>
				)}

				{/* 소설 텍스트 미리보기 */}
				{post.projectType === "NOVEL" && pages.length > 0 && (
					<section className="mt-12">
						<h2 className="text-lg font-bold text-gray-800 mb-4">
							본문 미리보기
						</h2>
						<div className="space-y-4">
							{pages.slice(0, 3).map((page) => (
								<div
									key={page.id}
									className="bg-white rounded-2xl border border-rose-100 p-5"
								>
									<p className="text-xs font-bold text-gray-400 mb-2">
										{page.pageOrder}페이지
									</p>
									{page.caption ? (
										<p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
											{page.caption}
										</p>
									) : (
										<p className="text-sm text-gray-400 italic">
											내용 없음
										</p>
									)}
								</div>
							))}
							{pages.length > 3 && (
								<p className="text-center text-sm text-gray-400">
									총 {pages.length}페이지 · 나머지{" "}
									{pages.length - 3}페이지는 작품을
									구매하세요.
								</p>
							)}
						</div>
					</section>
				)}

				{/* 댓글 */}
				<section className="mt-12">
					<h2 className="text-lg font-bold text-gray-800 mb-6">
						댓글{" "}
						{post._count.comments > 0
							? `(${post._count.comments})`
							: ""}
					</h2>

					{/* 댓글 입력 */}
					<div className="flex gap-3 mb-8">
						<div className="w-8 h-8 bg-gradient-to-br from-rose-300 to-purple-300 rounded-full flex-shrink-0" />
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
								className="flex-1 text-sm px-4 py-2.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-200"
							/>
							<button
								onClick={handleCommentSubmit}
								disabled={
									submittingComment || !newComment.trim()
								}
								className="px-4 py-2.5 bg-rose-500 text-white text-sm font-semibold rounded-2xl hover:bg-rose-600 disabled:opacity-60 transition-colors"
							>
								{submittingComment ? "..." : "등록"}
							</button>
						</div>
					</div>

					{/* 댓글 목록 */}
					{comments.length === 0 ? (
						<p className="text-center text-gray-400 py-8">
							첫 댓글을 남겨보세요!
						</p>
					) : (
						<div className="divide-y divide-gray-50">
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

			{/* 페이지 라이트박스 */}
			{selectedPage && (
				<div
					className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
					onClick={() => setSelectedPage(null)}
				>
					<div
						className="relative max-w-lg w-full max-h-[90vh]"
						onClick={(e) => e.stopPropagation()}
					>
						{selectedPage.imageUrl && (
							<img
								src={selectedPage.imageUrl}
								alt={`${selectedPage.pageOrder}페이지`}
								className="w-full h-auto rounded-2xl object-contain max-h-[80vh]"
							/>
						)}
						{selectedPage.caption && (
							<p className="mt-3 text-white text-sm text-center leading-relaxed">
								{selectedPage.caption}
							</p>
						)}
						<p className="text-gray-400 text-xs text-center mt-2">
							{selectedPage.pageOrder} / {pages.length}페이지
						</p>
						<button
							onClick={() => setSelectedPage(null)}
							className="absolute -top-2 -right-2 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full text-white flex items-center justify-center text-lg"
						>
							×
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
