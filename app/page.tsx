import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import type { Project } from "@/types";
import { ProjectCard } from "./components/ProjectCard";
import { AuthMenu } from "./components/AuthMenu";

export const dynamic = "force-dynamic";

async function getProjects(userId: string): Promise<Project[]> {
	try {
		const rows = await prisma.project.findMany({
			where: { userId },
			include: { pages: { orderBy: { pageOrder: "asc" } } },
			orderBy: { updatedAt: "desc" },
		});
		return rows.map((p: any) => ({
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
	const projects = user ? await getProjects(user.id) : [];

	return (
		<div className="min-h-screen">
			{/* ─── Hero ─── */}
			<section className="relative overflow-hidden bg-gradient-to-br from-rose-400 via-pink-300 to-purple-400 text-slate-900">
				<div className="relative max-w-6xl mx-auto px-6 pt-5 flex justify-end">
					<AuthMenu user={user} />
				</div>
				{/* 배경 장식 */}
				<div className="absolute inset-0 opacity-10 pointer-events-none select-none">
					<div className="absolute top-10 left-10 text-9xl">♡</div>
					<div className="absolute top-32 right-20 text-7xl">✦</div>
					<div className="absolute bottom-20 left-1/3 text-8xl">
						◇
					</div>
					<div className="absolute bottom-10 right-10 text-6xl">
						♡
					</div>
				</div>

				<div className="relative max-w-4xl mx-auto px-6 py-24 text-center">
					<p className="text-slate-600 text-sm font-medium tracking-widest uppercase mb-4">
						Dreamcatcher · 포토북 / 만화 / 소설 제작 스튜디오
					</p>
					<h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
						Dreamcatcher,
						<br />
						꿈꾸던 이야기를 현실의 책으로
					</h1>
					<p className="text-slate-700 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
						포토북, 만화, 소설을 원하는 설정으로 제작하고
						<br />
						출판과 주문을 거쳐 실제 책으로 받아보세요.
					</p>
					{user ? (
						<Link
							href="/create"
							className="inline-block bg-slate-900 text-white font-semibold text-lg px-10 py-4 rounded-full shadow-lg hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
						>
							새 프로젝트 만들기 →
						</Link>
					) : (
						<div className="flex items-center justify-center gap-3">
							<Link
								href="/login"
								className="inline-block bg-slate-900 text-white font-semibold text-lg px-8 py-4 rounded-full shadow-lg hover:bg-slate-800"
							>
								로그인
							</Link>
							<Link
								href="/signup"
								className="inline-block bg-white/90 text-slate-900 font-semibold text-lg px-8 py-4 rounded-full shadow-lg hover:bg-white"
							>
								회원가입
							</Link>
						</div>
					)}

					{/* 통계 */}
					<div className="flex justify-center gap-12 mt-16 text-center">
						{[
							{ num: "기획", desc: "Dreamcatcher AI 생성" },
							{ num: "제작", desc: "포토북·만화·소설 실물화" },
							{ num: "수령", desc: "주문 후 배송까지 완료" },
						].map(({ num, desc }) => (
							<div key={num}>
								<p className="text-2xl font-bold">{num}</p>
								<p className="text-slate-600 text-sm mt-1">
									{desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── 서비스 흐름 ─── */}
			<section className="max-w-4xl mx-auto px-6 py-20">
				<h2 className="text-center text-3xl font-bold text-gray-800 mb-12">
					Dreamcatcher로 완성하는 3가지 제작 방식
				</h2>
				<div className="grid md:grid-cols-3 gap-8">
					{[
						{
							step: "PHOTO",
							icon: "📸",
							title: "포토북 제작",
							desc: "사진과 문구를 구성해 바로 출판하고 주문해 실물 포토북으로 받아볼 수 있습니다.",
						},
						{
							step: "COMIC",
							icon: "✍️",
							title: "만화책 자동 생성",
							desc: "AI가 줄거리와 컷 구성을 생성하고 이미지까지 제작해 실물 만화책 주문으로 이어집니다.",
						},
						{
							step: "NOVEL",
							icon: "📚",
							title: "소설 자동 생성",
							desc: "AI가 챕터와 본문을 설계해 소설 프로젝트를 만들고 출판/주문까지 연결합니다.",
						},
					].map(({ step, icon, title, desc }) => (
						<div key={step} className="text-center">
							<div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
								{icon}
							</div>
							<p className="text-rose-400 text-xs font-bold tracking-widest mb-2">
								STEP {step}
							</p>
							<h3 className="text-lg font-bold text-gray-800 mb-2">
								{title}
							</h3>
							<p className="text-gray-500 text-sm leading-relaxed">
								{desc}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* ─── 프로젝트 목록 ─── */}
			{user && projects.length > 0 && (
				<section className="max-w-5xl mx-auto px-6 pb-20">
					<div className="flex items-center justify-between mb-8">
						<h2 className="text-2xl font-serif font-bold text-gray-800">
							나의 프로젝트
						</h2>
						<Link
							href="/create"
							className="text-rose-500 text-sm font-medium hover:underline"
						>
							+ 새로 만들기
						</Link>
					</div>
					<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
						{projects.map((project) => (
							<ProjectCard key={project.id} project={project} />
						))}
					</div>
				</section>
			)}

			{!user && (
				<section className="max-w-4xl mx-auto px-6 pb-20">
					<div className="bg-white border border-rose-100 rounded-2xl p-8 text-center">
						<h3 className="text-xl font-bold text-gray-800 mb-2">
							내 프로젝트는 로그인 후 저장됩니다
						</h3>
						<p className="text-gray-500 mb-5">
							회원가입 후 포토북/만화/소설 프로젝트를 계정에
							안전하게 보관하세요.
						</p>
						<div className="flex items-center justify-center gap-3">
							<Link
								href="/login"
								className="px-5 py-2.5 rounded-lg bg-rose-500 text-white font-semibold hover:bg-rose-600"
							>
								로그인
							</Link>
							<Link
								href="/signup"
								className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
							>
								회원가입
							</Link>
						</div>
					</div>
				</section>
			)}

			{/* ─── Footer ─── */}
			<footer className="border-t border-rose-100 py-10 text-center text-gray-400 text-sm">
				<p className="font-medium text-gray-600 mb-1">Dreamcatcher</p>
				<p>
					Powered by{" "}
					<a
						href="https://api.sweetbook.com"
						className="text-rose-400 hover:underline"
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
