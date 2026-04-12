"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

type PostItem = {
	id: string;
	description: string | null;
	projectType: string;
	createdAt: string;
	user: { id: string; name: string | null };
	project: {
		title: string;
		coverImageUrl: string | null;
		genre: string | null;
		_count: { pages: number };
	};
	_count: { likes: number; comments: number };
	likedByMe: boolean;
};

type ShareableProject = {
	id: string;
	title: string;
	coverImageUrl: string | null;
	projectType: string;
};

const TYPE_MAP: Record<string, { label: string; color: string }> = {
	COMIC: { label: "만화책", color: "bg-violet-100 text-violet-700" },
	NOVEL: { label: "소설", color: "bg-blue-100 text-blue-700" },
};

function PostCard({
	post,
	onLike,
}: {
	post: PostItem;
	onLike: (id: string) => void;
}) {
	const type = TYPE_MAP[post.projectType] ?? {
		label: post.projectType,
		color: "bg-gray-100 text-gray-700",
	};

	return (
		<Link
			href={`/community/${post.id}`}
			className="group bg-white rounded-2xl overflow-hidden border border-rose-100 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col"
		>
			{/* 커버 이미지 */}
			<div className="relative w-full aspect-[3/4] bg-gradient-to-br from-rose-50 to-purple-50 overflow-hidden">
				{post.project.coverImageUrl ? (
					<Image
						src={post.project.coverImageUrl}
						alt={post.project.title}
						fill
						className="object-cover group-hover:scale-105 transition-transform duration-300"
						sizes="(max-width: 768px) 50vw, 33vw"
					/>
				) : (
					<div className="flex items-center justify-center h-full text-4xl">
						{post.projectType === "COMIC" ? "✍️" : "📚"}
					</div>
				)}
				<div className="absolute top-3 left-3">
					<span
						className={`text-xs font-semibold px-2 py-1 rounded-full ${type.color}`}
					>
						{type.label}
					</span>
				</div>
			</div>

			{/* 정보 */}
			<div className="p-4 flex flex-col gap-2 flex-1">
				<h3 className="font-bold text-gray-800 line-clamp-1 group-hover:text-rose-600 transition-colors">
					{post.project.title}
				</h3>
				{post.description && (
					<p className="text-gray-500 text-sm line-clamp-2">
						{post.description}
					</p>
				)}
				<div className="flex items-center justify-between mt-auto pt-2">
					<span className="text-xs text-gray-400 truncate">
						{post.user.name ?? "익명"}
					</span>
					<div className="flex items-center gap-3 text-xs text-gray-500">
						<button
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onLike(post.id);
							}}
							className={`flex items-center gap-1 transition-colors ${
								post.likedByMe
									? "text-rose-500"
									: "hover:text-rose-500"
							}`}
						>
							<span>{post.likedByMe ? "♥" : "♡"}</span>
							<span>{post._count.likes}</span>
						</button>
						<span className="flex items-center gap-1">
							<span>💬</span>
							<span>{post._count.comments}</span>
						</span>
					</div>
				</div>
			</div>
		</Link>
	);
}

export default function CommunityPage() {
	const router = useRouter();
	const [posts, setPosts] = useState<PostItem[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [currentUser, setCurrentUser] = useState<{
		id: string;
		name: string | null;
	} | null>(null);
	const [authLoading, setAuthLoading] = useState(true);

	// 공유 모달
	const [showShareModal, setShowShareModal] = useState(false);
	const [shareableProjects, setShareableProjects] = useState<
		ShareableProject[]
	>([]);
	const [selectedProjectId, setSelectedProjectId] = useState("");
	const [shareDescription, setShareDescription] = useState("");
	const [sharing, setSharing] = useState(false);
	const [shareError, setShareError] = useState("");
	const [shareSuccess, setShareSuccess] = useState(false);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 사용자 인증 확인
	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => r.json())
			.then((d) => {
				if (d.success && d.user) setCurrentUser(d.user);
			})
			.finally(() => setAuthLoading(false));
	}, []);

	// 검색어 디바운스
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setDebouncedQuery(query);
		}, 400);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query]);

	// 포스트 목록 가져오기
	const fetchPosts = useCallback(
		async (q: string, cursor?: string) => {
			const params = new URLSearchParams();
			if (q) params.set("q", q);
			if (cursor) params.set("cursor", cursor);
			const res = await fetch(`/api/community?${params.toString()}`);
			if (res.status === 401) {
				router.push("/login");
				return null;
			}
			if (!res.ok) return null;
			const data = await res.json();
			return data;
		},
		[router],
	);

	useEffect(() => {
		if (authLoading) return;
		if (!currentUser) {
			router.push("/login");
			return;
		}
		setLoading(true);
		fetchPosts(debouncedQuery).then((data) => {
			if (data?.success) {
				setPosts(data.data);
				setNextCursor(data.nextCursor);
			}
			setLoading(false);
		});
	}, [debouncedQuery, authLoading, currentUser, router, fetchPosts]);

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		const data = await fetchPosts(debouncedQuery, nextCursor);
		if (data?.success) {
			setPosts((prev) => [...prev, ...data.data]);
			setNextCursor(data.nextCursor);
		}
		setLoadingMore(false);
	}

	async function handleLike(postId: string) {
		if (!currentUser) return;
		const res = await fetch(`/api/community/${postId}/like`, {
			method: "POST",
		});
		if (!res.ok) return;
		const { liked, count } = await res.json();
		setPosts((prev) =>
			prev.map((p) =>
				p.id === postId
					? {
							...p,
							likedByMe: liked,
							_count: { ...p._count, likes: count },
						}
					: p,
			),
		);
	}

	async function openShareModal() {
		setShareError("");
		setShareSuccess(false);
		setSelectedProjectId("");
		setShareDescription("");

		// 이미 공유된 프로젝트를 제외한 출판된 COMIC/NOVEL 목록
		const [projRes, communityRes] = await Promise.all([
			fetch("/api/projects"),
			fetch("/api/community"),
		]);
		if (!projRes.ok) return;
		const projData = await projRes.json();
		const communityData = communityRes.ok
			? await communityRes.json()
			: { data: [] };

		const sharedProjectIds = new Set<string>(
			(communityData.data ?? [])
				.filter((p: PostItem) => p.user.id === currentUser?.id)
				.map((p: PostItem) => p.project.title), // title이 아니라 projectId를 써야함
		);

		// 공유 가능한 프로젝트: 로그인 유저 소유, PUBLISHED, COMIC/NOVEL
		const eligible = (projData.data ?? projData.projects ?? []).filter(
			(p: any) =>
				p.status === "PUBLISHED" &&
				(p.projectType === "COMIC" || p.projectType === "NOVEL") &&
				p.userId === currentUser?.id &&
				!p.post, // post relation이 null이면 아직 공유 안됨
		);
		setShareableProjects(eligible);
		setShowShareModal(true);
	}

	async function handleShare() {
		if (!selectedProjectId) {
			setShareError("공유할 프로젝트를 선택해주세요.");
			return;
		}
		setSharing(true);
		setShareError("");
		const res = await fetch("/api/community", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				projectId: selectedProjectId,
				description: shareDescription,
			}),
		});
		const data = await res.json();
		setSharing(false);
		if (!data.success) {
			setShareError(data.error ?? "공유에 실패했습니다.");
			return;
		}
		setShareSuccess(true);
		setShowShareModal(false);
		// 목록 새로고침
		setLoading(true);
		fetchPosts(debouncedQuery).then((d) => {
			if (d?.success) {
				setPosts(d.data);
				setNextCursor(d.nextCursor);
			}
			setLoading(false);
		});
	}

	return (
		<div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
			{/* 헤더 */}
			<header className="bg-white/80 backdrop-blur-sm border-b border-rose-100 sticky top-0 z-40">
				<div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
					<div className="flex items-center gap-4">
						<Link
							href="/"
							className="text-sm text-gray-500 hover:text-rose-600 transition-colors"
						>
							← 홈
						</Link>
						<h1 className="text-base font-bold text-gray-800">
							커뮤니티
						</h1>
					</div>
					{currentUser && (
						<button
							onClick={openShareModal}
							className="text-sm font-semibold bg-rose-500 text-white px-4 py-1.5 rounded-full hover:bg-rose-600 transition-colors"
						>
							+ 내 작품 공유하기
						</button>
					)}
				</div>
			</header>

			<main className="max-w-5xl mx-auto px-4 py-8">
				{/* 검색 */}
				<div className="relative mb-8">
					<span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
						🔍
					</span>
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="제목, 설명, 작가 이름으로 검색..."
						className="w-full pl-10 pr-4 py-3 rounded-2xl border border-rose-100 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-300 text-gray-800 placeholder-gray-400"
					/>
				</div>

				{/* 성공 메시지 */}
				{shareSuccess && (
					<div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-sm">
						🎉 작품이 커뮤니티에 공유되었습니다!
					</div>
				)}

				{/* 포스트 그리드 */}
				{loading ? (
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{Array.from({ length: 8 }).map((_, i) => (
							<div
								key={i}
								className="bg-white rounded-2xl overflow-hidden border border-rose-100 animate-pulse"
							>
								<div className="aspect-[3/4] bg-rose-50" />
								<div className="p-4 space-y-2">
									<div className="h-4 bg-rose-50 rounded w-3/4" />
									<div className="h-3 bg-rose-50 rounded w-1/2" />
								</div>
							</div>
						))}
					</div>
				) : posts.length === 0 ? (
					<div className="text-center py-20 text-gray-400">
						<p className="text-4xl mb-4">📭</p>
						<p className="text-lg font-medium">
							{debouncedQuery
								? "검색 결과가 없습니다."
								: "아직 공유된 작품이 없습니다."}
						</p>
						<p className="text-sm mt-1">
							첫 번째로 작품을 공유해보세요!
						</p>
					</div>
				) : (
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{posts.map((post) => (
							<PostCard
								key={post.id}
								post={post}
								onLike={handleLike}
							/>
						))}
					</div>
				)}

				{/* 더 보기 */}
				{nextCursor && (
					<div className="flex justify-center mt-10">
						<button
							onClick={loadMore}
							disabled={loadingMore}
							className="px-8 py-3 rounded-full border border-rose-200 text-rose-600 font-medium hover:bg-rose-50 transition-colors disabled:opacity-60"
						>
							{loadingMore ? "불러오는 중..." : "더 보기"}
						</button>
					</div>
				)}
			</main>

			{/* 공유 모달 */}
			{showShareModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
					<div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
						<div className="p-6">
							<div className="flex items-center justify-between mb-5">
								<h2 className="text-xl font-bold text-gray-800">
									작품 공유하기
								</h2>
								<button
									onClick={() => setShowShareModal(false)}
									className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
								>
									×
								</button>
							</div>

							{shareableProjects.length === 0 ? (
								<div className="text-center py-8 text-gray-500">
									<p className="text-3xl mb-3">📦</p>
									<p className="font-medium">
										공유 가능한 작품이 없습니다.
									</p>
									<p className="text-sm mt-1 text-gray-400">
										출판 완료된 만화책 또는 소설을 먼저
										제작해주세요.
									</p>
									<Link
										href="/create"
										className="inline-block mt-4 px-5 py-2 bg-rose-500 text-white rounded-full text-sm font-semibold hover:bg-rose-600"
									>
										새 작품 만들기
									</Link>
								</div>
							) : (
								<>
									<p className="text-sm text-gray-500 mb-4">
										공유할 출판 작품을 선택하세요. (이미
										공유된 작품은 표시되지 않습니다)
									</p>

									{/* 프로젝트 선택 */}
									<div className="space-y-2 mb-5 max-h-48 overflow-y-auto">
										{shareableProjects.map((p) => (
											<button
												key={p.id}
												onClick={() =>
													setSelectedProjectId(p.id)
												}
												className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${
													selectedProjectId === p.id
														? "border-rose-400 bg-rose-50"
														: "border-gray-100 hover:border-rose-200"
												}`}
											>
												<div className="w-10 h-14 bg-rose-50 rounded overflow-hidden flex-shrink-0 relative">
													{p.coverImageUrl ? (
														<Image
															src={
																p.coverImageUrl
															}
															alt={p.title}
															fill
															className="object-cover"
															sizes="40px"
														/>
													) : (
														<div className="flex items-center justify-center h-full text-xl">
															{p.projectType ===
															"COMIC"
																? "✍️"
																: "📚"}
														</div>
													)}
												</div>
												<div className="min-w-0">
													<p className="font-medium text-gray-800 truncate">
														{p.title}
													</p>
													<p className="text-xs text-gray-400">
														{p.projectType ===
														"COMIC"
															? "만화책"
															: "소설"}
													</p>
												</div>
											</button>
										))}
									</div>

									{/* 설명 입력 */}
									<textarea
										value={shareDescription}
										onChange={(e) =>
											setShareDescription(e.target.value)
										}
										placeholder="작품 소개를 입력하세요 (선택사항)"
										rows={3}
										maxLength={300}
										className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none mb-1"
									/>
									<p className="text-xs text-gray-400 text-right mb-4">
										{shareDescription.length}/300
									</p>

									{shareError && (
										<p className="text-red-500 text-sm mb-3">
											{shareError}
										</p>
									)}

									<button
										onClick={handleShare}
										disabled={sharing || !selectedProjectId}
										className="w-full py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors disabled:opacity-60"
									>
										{sharing ? "공유 중..." : "공유하기"}
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
