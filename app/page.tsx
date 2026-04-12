import Link from "next/link";
import Image from "next/image";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";
import { DEFAULT_PHOTOBOOK_SPEC_UID } from "@/lib/book-specs";
import type { Project } from "@/types";
import { ProjectCard } from "./components/ProjectCard";
import { AuthMenu } from "./components/AuthMenu";

export const dynamic = "force-dynamic";

type SweetbookBookRecord = {
	bookUid?: string;
	title?: string;
	status?: string;
	bookStatus?: string;
	state?: string;
	bookSpecUid?: string;
	coverImageUrl?: string;
	coverUrl?: string;
	thumbnailUrl?: string;
	[key: string]: unknown;
};

function normalizeSweetbookBookList(
	payload: Record<string, unknown>,
): SweetbookBookRecord[] {
	const candidates = [
		payload.books,
		payload.items,
		payload.list,
		payload.results,
		payload.data,
	];

	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) {
			continue;
		}
		return candidate.filter(
			(item): item is SweetbookBookRecord =>
				Boolean(item) && typeof item === "object",
		);
	}

	return [];
}

function mapSweetbookBookStatus(
	item: SweetbookBookRecord,
): "DRAFT" | "PUBLISHED" {
	const raw = String(item.status || item.bookStatus || item.state || "")
		.toUpperCase()
		.trim();
	if (
		raw.includes("DRAFT") ||
		raw.includes("CREATED") ||
		raw.includes("EDIT") ||
		raw.includes("OPEN")
	) {
		return "DRAFT";
	}
	return "PUBLISHED";
}

async function syncProjectsFromSweetbookForUser(userId: string): Promise<void> {
	if (!isSweetbookConfigured()) {
		return;
	}

	try {
		const client = getSweetbookClient();
		const raw = (await client.books.list({
			limit: 200,
			offset: 0,
		})) as Record<string, unknown>;
		const remoteBooks = normalizeSweetbookBookList(raw);

		for (const remote of remoteBooks) {
			const bookUid =
				typeof remote.bookUid === "string" ? remote.bookUid.trim() : "";
			if (!bookUid) {
				continue;
			}

			const existing = await prisma.project.findFirst({
				where: {
					bookUid,
					OR: [{ userId }, { isDefault: true }],
				},
				select: { id: true },
			});
			if (existing) {
				continue;
			}

			const titleCandidate =
				typeof remote.title === "string" ? remote.title.trim() : "";
			const title = titleCandidate || bookUid;
			const bookSpecUid =
				typeof remote.bookSpecUid === "string" &&
				remote.bookSpecUid.trim()
					? remote.bookSpecUid
					: DEFAULT_PHOTOBOOK_SPEC_UID;
			const coverImageUrl =
				typeof remote.coverImageUrl === "string" &&
				remote.coverImageUrl.trim()
					? remote.coverImageUrl
					: typeof remote.coverUrl === "string" &&
						  remote.coverUrl.trim()
						? remote.coverUrl
						: typeof remote.thumbnailUrl === "string" &&
							  remote.thumbnailUrl.trim()
							? remote.thumbnailUrl
							: null;

			await prisma.project.create({
				data: {
					userId,
					title,
					projectType: "PHOTOBOOK",
					bookSpecUid,
					bookUid,
					status: mapSweetbookBookStatus(remote),
					coverImageUrl,
				},
			});
		}
	} catch (error) {
		console.error("[HomePage] Sweetbook sync failed:", error);
	}
}

async function getProjects(userId: string): Promise<Project[]> {
	try {
		await syncProjectsFromSweetbookForUser(userId);

		const rows = (await (
			prisma.project.findMany as (args: unknown) => Promise<unknown[]>
		)({
			where: { OR: [{ userId }, { isDefault: true }] },
			include: { pages: { orderBy: { pageOrder: "asc" } } },
			orderBy: [{ isDefault: "asc" }, { updatedAt: "desc" }],
		})) as any[];

		// 사용자가 클론을 가진 isDefault 프로젝트는 숨김 (클론이 우선)
		const userOwnedBookUids = new Set<string>(
			rows
				.filter(
					(p: any) =>
						!p.isDefault && p.userId === userId && p.bookUid,
				)
				.map((p: any) => p.bookUid),
		);

		const seen = new Set<string>();
		return rows
			.filter((p: any) => {
				if (seen.has(p.id)) return false;
				seen.add(p.id);
				// isDefault이면서 사용자 클론이 있으면 숨김
				if (
					p.isDefault &&
					p.bookUid &&
					userOwnedBookUids.has(p.bookUid)
				) {
					return false;
				}
				return true;
			})
			.map((p: any) => ({
				...p,
				createdAt: p.createdAt.toISOString(),
				updatedAt: p.updatedAt.toISOString(),
				pages: p.pages.map((pg: any) => ({
					...pg,
					createdAt: pg.createdAt.toISOString(),
					updatedAt: pg.updatedAt.toISOString(),
				})),
				status: p.status as Project["status"],
			}));
	} catch (error) {
		console.error("[HomePage] Failed to load projects:", error);
		return [];
	}
}

async function getRecentPosts(limit = 6) {
	try {
		const posts = await (prisma as any).post.findMany({
			orderBy: { createdAt: "desc" },
			take: limit,
			select: {
				id: true,
				projectType: true,
				description: true,
				user: { select: { name: true } },
				project: {
					select: { title: true, coverImageUrl: true, genre: true },
				},
				_count: { select: { likes: true, comments: true } },
			},
		});
		return posts as Array<{
			id: string;
			projectType: string;
			description: string | null;
			user: { name: string | null };
			project: {
				title: string;
				coverImageUrl: string | null;
				genre: string | null;
			};
			_count: { likes: number; comments: number };
		}>;
	} catch {
		return [];
	}
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
	DRAFT: { label: "편집 중", color: "bg-amber-100 text-amber-700" },
	GENERATING: { label: "생성 중", color: "bg-violet-100 text-violet-700" },
	PUBLISHED: { label: "출판 완료", color: "bg-blue-100 text-blue-700" },
	ORDERED: { label: "주문 완료", color: "bg-green-100 text-green-700" },
};

function getProjectStatus(project: Project): keyof typeof STATUS_MAP {
	if (
		project.status === "DRAFT" &&
		project.projectType !== "PHOTOBOOK" &&
		project.generationStage &&
		project.generationStage !== "COMPLETED" &&
		project.generationStage !== "FAILED"
	) {
		return "GENERATING";
	}
	return project.status;
}

const TYPE_MAP: Record<string, string> = {
	PHOTOBOOK: "포토북",
	COMIC: "만화책",
	NOVEL: "소설",
};

export default async function HomePage() {
	const user = await getAuthUserFromCookies();
	const [projects, recentPosts] = await Promise.all([
		user ? getProjects(user.id) : Promise.resolve([]),
		getRecentPosts(6),
	]);

	return (
		<div className="min-h-screen bg-zinc-950">
			{/* ─── 상단 네비 ─── */}
			<header className="sticky top-0 z-40 bg-zinc-950 border-b border-white/[0.08]">
				<div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
					{/* 로고 */}
					<Link
						href="/"
						className="text-4xl font-black text-white tracking-tight"
					>
						Dreamcatcher
					</Link>

					{/* Auth */}
					<div className="flex items-center gap-3">
						<AuthMenu user={user} />
					</div>
				</div>
			</header>

			{/* ─── Hero ─── */}
			<section className="relative overflow-hidden bg-zinc-950 text-white">
				{/* 배경 글로우 */}
				<div className="absolute inset-0 pointer-events-none select-none">
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-violet-700/20 rounded-full blur-[120px]" />
				</div>

				<div className="relative max-w-5xl mx-auto px-6 py-28 md:py-36 text-center">
					<div className="inline-flex items-center gap-2 border border-white/15 bg-white/5 rounded-full px-4 py-1.5 text-xs font-medium mb-8 text-white/60 tracking-wide uppercase">
						<span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
						AI 기반 만화·소설 자동 생성 플랫폼
					</div>
					<h1 className="text-4xl md:text-[64px] font-black leading-[1.1] tracking-tight mb-6">
						상상을 AI로 만들고,
						<br />
						<span className="text-violet-400">
							커뮤니티에서 공유하세요
						</span>
					</h1>
					<p className="text-white/50 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
						캐릭터와 설정만 입력하면 AI가 만화책과 소설을 자동으로
						생성합니다. 완성된 작품은 실물 책으로 주문하거나
						커뮤니티에 공유하세요.
					</p>

					<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
						{user ? (
							<>
								<Link
									href="/create"
									className="inline-flex items-center gap-2 bg-violet-600 text-white font-bold text-base px-7 py-3.5 rounded-xl hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40"
								>
									AI로 작품 만들기
								</Link>
								<Link
									href="/community"
									className="inline-flex items-center gap-2 bg-violet-600 text-white font-bold text-base px-7 py-3.5 rounded-xl hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40"
								>
									커뮤니티
								</Link>
							</>
						) : (
							<>
								<Link
									href="/signup"
									className="inline-flex items-center gap-2 bg-violet-600 text-white font-bold text-base px-7 py-3.5 rounded-xl hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40"
								>
									무료로 시작하기
								</Link>
								<Link
									href="/community"
									className="inline-flex items-center gap-2 text-white/70 font-medium text-base px-7 py-3.5 rounded-xl border border-white/10 hover:border-white/25 hover:text-white transition-all"
								>
									커뮤니티 둘러보기
								</Link>
							</>
						)}
					</div>

					{/* 미니 스탯 */}
					<div className="flex justify-center gap-12 mt-20 text-center">
						{[
							{ label: "AI 자동 생성", sub: "만화·소설" },
							{ label: "실물 책 주문", sub: "포토북 인쇄" },
							{ label: "커뮤니티 공유", sub: "좋아요·댓글" },
						].map(({ label, sub }) => (
							<div key={label}>
								<p className="text-sm font-bold text-white/80 mb-0.5">
									{label}
								</p>
								<p className="text-xs text-white/35">{sub}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── 섹션 구분선 ─── */}
			<div className="border-t border-white/[0.06]" />

			{/* ─── 핵심 기능 카드 ─── */}
			<section className="max-w-5xl mx-auto px-5 py-24">
				<p className="text-center text-violet-400 text-[11px] font-bold tracking-[0.2em] uppercase mb-3">
					핵심 기능
				</p>
				<h2 className="text-center text-3xl font-black text-white tracking-tight mb-14">
					AI가 처음부터 끝까지 만들어 드립니다
				</h2>
				<div className="grid md:grid-cols-3 gap-5">
					{/* 만화책 */}
					<div className="group bg-zinc-900 rounded-2xl p-7 border border-white/[0.07] hover:border-violet-500/40 hover:bg-zinc-800/80 transition-all">
						<div className="w-11 h-11 bg-zinc-800 rounded-xl flex items-center justify-center text-xl mb-5 group-hover:bg-violet-900/50 transition-colors">
							✍️
						</div>
						<p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-2">
							AI 만화책
						</p>
						<h3 className="text-lg font-bold text-white mb-2.5">
							AI 만화책 자동 생성
						</h3>
						<p className="text-white/40 text-sm leading-relaxed mb-6">
							캐릭터, 장르, 스타일을 설정하면 AI가 줄거리부터 각
							컷의 이미지까지 자동으로 생성합니다.
						</p>
						<Link
							href={user ? "/create" : "/signup"}
							className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
						>
							만화책 만들기 →
						</Link>
					</div>

					{/* 소설 */}
					<div className="group bg-zinc-900 rounded-2xl p-7 border border-white/[0.07] hover:border-violet-500/40 hover:bg-zinc-800/80 transition-all">
						<div className="w-11 h-11 bg-zinc-800 rounded-xl flex items-center justify-center text-xl mb-5 group-hover:bg-violet-900/50 transition-colors">
							📚
						</div>
						<p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-2">
							AI 소설
						</p>
						<h3 className="text-lg font-bold text-white mb-2.5">
							AI 소설 자동 생성
						</h3>
						<p className="text-white/40 text-sm leading-relaxed mb-6">
							세계관과 캐릭터를 입력하면 AI가 챕터 구성, 본문,
							줄거리를 완성도 높게 작성합니다.
						</p>
						<Link
							href={user ? "/create" : "/signup"}
							className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
						>
							소설 만들기 →
						</Link>
					</div>

					{/* 커뮤니티 */}
					<div className="group bg-zinc-900 rounded-2xl p-7 border border-white/[0.07] hover:border-violet-500/40 hover:bg-zinc-800/80 transition-all">
						<div className="w-11 h-11 bg-zinc-800 rounded-xl flex items-center justify-center text-xl mb-5 group-hover:bg-violet-900/50 transition-colors">
							🌐
						</div>
						<p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest mb-2">
							커뮤니티
						</p>
						<h3 className="text-lg font-bold text-white mb-2.5">
							작품 공유 & 소통
						</h3>
						<p className="text-white/40 text-sm leading-relaxed mb-6">
							완성된 만화·소설을 커뮤니티에 공개하고 좋아요,
							댓글로 독자들과 소통하세요.
						</p>
						<Link
							href="/community"
							className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
						>
							커뮤니티 보러가기 →
						</Link>
					</div>
				</div>
			</section>

			{/* ─── 최근 커뮤니티 작품 ─── */}
			{recentPosts.length > 0 && (
				<section className="border-t border-white/[0.06] py-20">
					<div className="max-w-5xl mx-auto px-5">
						<div className="flex items-center justify-between mb-10">
							<div>
								<p className="text-violet-400 text-[11px] font-bold tracking-[0.2em] uppercase mb-2">
									커뮤니티
								</p>
								<h2 className="text-2xl font-black text-white">
									최근 공유된 작품
								</h2>
							</div>
							<Link
								href="/community"
								className="inline-flex items-center gap-1.5 border border-white/15 text-white/70 font-semibold text-sm px-4 py-2 rounded-lg hover:border-violet-400/50 hover:text-white transition-all"
							>
								더 보기 →
							</Link>
						</div>

						<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
							{recentPosts.map((post) => (
								<Link
									key={post.id}
									href={`/community/${post.id}`}
									className="group rounded-xl overflow-hidden border border-white/[0.07] hover:border-violet-400/40 transition-all"
								>
									<div className="relative aspect-[3/4] bg-zinc-800">
										{post.project.coverImageUrl ? (
											<Image
												src={post.project.coverImageUrl}
												alt={post.project.title}
												fill
												className="object-cover group-hover:scale-105 transition-transform duration-300"
												sizes="200px"
											/>
										) : (
											<div className="flex items-center justify-center h-full text-3xl">
												{post.projectType === "COMIC"
													? "✍️"
													: "📚"}
											</div>
										)}
									</div>
									<div className="px-2 py-2">
										<p className="text-xs font-semibold text-white/80 line-clamp-1">
											{post.project.title}
										</p>
										<p className="text-[10px] text-white/30 mt-0.5">
											♥ {post._count.likes} · 💬{" "}
											{post._count.comments}
										</p>
									</div>
								</Link>
							))}
						</div>
					</div>
				</section>
			)}

			{/* ─── 내 프로젝트 목록 ─── */}
			{user && projects.length > 0 && (
				<section className="border-t border-white/[0.06] max-w-5xl mx-auto px-5 py-16">
					<div className="flex items-center justify-between mb-7">
						<h2 className="text-xl font-bold text-white tracking-tight">
							나의 작품
						</h2>
						<Link
							href="/create"
							className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
						>
							+ 새로 만들기
						</Link>
					</div>
					<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
						{projects.map((project) => (
							<ProjectCard key={project.id} project={project} />
						))}
					</div>
				</section>
			)}

			{/* ─── 비로그인 CTA ─── */}
			{!user && (
				<section className="max-w-4xl mx-auto px-5 py-16">
					<div className="rounded-2xl bg-zinc-950 ring-1 ring-white/[0.08] p-10 text-center text-white">
						<div className="inline-block w-10 h-10 rounded-xl bg-violet-600/20 ring-1 ring-violet-400/30 mb-5" />
						<h3 className="text-2xl font-black tracking-tight mb-3">
							지금 바로 시작해보세요
						</h3>
						<p className="text-white/50 text-sm mb-8">
							회원가입 후 AI로 나만의 만화책과 소설을 무료로
							만들어보세요.
						</p>
						<div className="flex items-center justify-center gap-3">
							<Link
								href="/signup"
								className="px-6 py-2.5 rounded-lg bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 transition-colors shadow-lg shadow-violet-900/40"
							>
								무료 회원가입
							</Link>
							<Link
								href="/login"
								className="px-6 py-2.5 rounded-lg text-white/60 font-medium text-sm border border-white/10 hover:border-white/25 hover:text-white transition-all"
							>
								로그인
							</Link>
						</div>
					</div>
				</section>
			)}

			{/* ─── Footer ─── */}
			<footer className="bg-zinc-950 border-t border-white/[0.06] py-10 text-center text-sm">
				<p className="font-bold text-white/80 mb-1">Dreamcatcher</p>
				<p className="text-white/30 mb-1">
					AI 만화·소설 창작 & 커뮤니티 공유 플랫폼
				</p>
				<p className="text-white/20">
					Powered by{" "}
					<a
						href="https://api.sweetbook.com"
						className="text-violet-400/70 hover:text-violet-400 transition-colors"
						target="_blank"
						rel="noopener noreferrer"
					>
						Book Print API
					</a>
				</p>
			</footer>
		</div>
	);
}
