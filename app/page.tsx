import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import type { Project } from "@/types";

async function getProjects(): Promise<Project[]> {
	const rows = await prisma.project.findMany({
		include: { pages: { orderBy: { pageOrder: "asc" } } },
		orderBy: { updatedAt: "desc" },
	});
	return rows.map((p: any) => ({
		...p,
		anniversaryDate: p.anniversaryDate.toISOString(),
		createdAt: p.createdAt.toISOString(),
		updatedAt: p.updatedAt.toISOString(),
		pages: p.pages.map((pg: any) => ({
			...pg,
			createdAt: pg.createdAt.toISOString(),
			updatedAt: pg.updatedAt.toISOString(),
		})),
		status: p.status as Project["status"],
	}));
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
	DRAFT: { label: "편집 중", color: "bg-amber-100 text-amber-700" },
	PUBLISHED: { label: "출판 완료", color: "bg-blue-100 text-blue-700" },
	ORDERED: { label: "주문 완료", color: "bg-green-100 text-green-700" },
};

export default async function HomePage() {
	const projects = await getProjects();

	return (
		<div className="min-h-screen">
			{/* ─── Hero ─── */}
			<section className="relative overflow-hidden bg-gradient-to-br from-rose-400 via-pink-300 to-purple-400 text-white">
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
					<p className="text-rose-100 text-sm font-medium tracking-widest uppercase mb-4">
						Momento · 기념일 포토북
					</p>
					<h1 className="text-5xl md:text-6xl font-serif font-bold leading-tight mb-6">
						사랑의 순간을,
						<br />
						영원히 간직하세요
					</h1>
					<p className="text-rose-100 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
						함께 찍은 사진과 소중한 문구를 담아
						<br />
						세상에 단 하나뿐인 기념일 포토북을 만들어 보세요.
					</p>
					<Link
						href="/create"
						className="inline-block bg-white text-rose-600 font-semibold text-lg px-10 py-4 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
					>
						우리의 포토북 만들기 →
					</Link>

					{/* 통계 */}
					<div className="flex justify-center gap-12 mt-16 text-center">
						{[
							{ num: "1권", desc: "부터 제작 가능" },
							{ num: "POD", desc: "재고 없는 주문 제작" },
							{ num: "배송", desc: "인쇄부터 배송까지" },
						].map(({ num, desc }) => (
							<div key={num}>
								<p className="text-2xl font-bold">{num}</p>
								<p className="text-rose-100 text-sm mt-1">
									{desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── 서비스 흐름 ─── */}
			<section className="max-w-4xl mx-auto px-6 py-20">
				<h2 className="text-center text-3xl font-serif font-bold text-gray-800 mb-12">
					3단계로 완성되는 나만의 포토북
				</h2>
				<div className="grid md:grid-cols-3 gap-8">
					{[
						{
							step: "01",
							icon: "📸",
							title: "사진 업로드",
							desc: "함께 찍은 소중한 사진들을 페이지별로 업로드하세요.",
						},
						{
							step: "02",
							icon: "✍️",
							title: "문구 작성",
							desc: "각 페이지에 담고 싶은 이야기와 추억을 적어보세요.",
						},
						{
							step: "03",
							icon: "📦",
							title: "출판 & 배송",
							desc: "클릭 하나로 인쇄 주문 — 실물 포토북을 집으로 받아보세요.",
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
			{projects.length > 0 && (
				<section className="max-w-5xl mx-auto px-6 pb-20">
					<div className="flex items-center justify-between mb-8">
						<h2 className="text-2xl font-serif font-bold text-gray-800">
							나의 포토북
						</h2>
						<Link
							href="/create"
							className="text-rose-500 text-sm font-medium hover:underline"
						>
							+ 새로 만들기
						</Link>
					</div>
					<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
						{projects.map((project) => {
							const status =
								STATUS_MAP[project.status] ?? STATUS_MAP.DRAFT;
							const coverImage =
								project.coverImageUrl ||
								project.pages[0]?.imageUrl ||
								`https://picsum.photos/seed/${project.id}/400/300`;
							const anniversary = new Date(
								project.anniversaryDate,
							).toLocaleDateString("ko-KR", {
								year: "numeric",
								month: "long",
								day: "numeric",
							});

							return (
								<div
									key={project.id}
									className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden hover:shadow-md transition-shadow"
								>
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
									</div>

									{/* 정보 */}
									<div className="p-4">
										<h3 className="font-bold text-gray-800 text-base mb-1 truncate">
											{project.title}
										</h3>
										<p className="text-gray-500 text-sm mb-1">
											{project.coupleNameA} &amp;{" "}
											{project.coupleNameB}
										</p>
										<p className="text-rose-400 text-xs mb-4">
											{anniversary} 기념일
										</p>
										<div className="flex items-center justify-between">
											<span className="text-gray-400 text-xs">
												{project.pages.length}페이지
											</span>
											<ProjectAction project={project} />
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</section>
			)}

			{/* ─── Footer ─── */}
			<footer className="border-t border-rose-100 py-10 text-center text-gray-400 text-sm">
				<p className="font-medium text-gray-600 mb-1">Momento</p>
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

function ProjectAction({ project }: { project: Project }) {
	if (project.status === "ORDERED" && project.orderUid) {
		return (
			<Link
				href={`/status/${project.orderUid}`}
				className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition-colors"
			>
				배송 현황 →
			</Link>
		);
	}
	if (project.status === "PUBLISHED" && project.bookUid) {
		return (
			<Link
				href={`/order/${project.id}`}
				className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors"
			>
				주문하기 →
			</Link>
		);
	}
	return (
		<Link
			href={`/editor/${project.id}`}
			className="text-xs bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg font-medium hover:bg-rose-100 transition-colors"
		>
			편집하기 →
		</Link>
	);
}
