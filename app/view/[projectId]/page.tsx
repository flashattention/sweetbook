import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import type { Project } from "@/types";
import { parseTemplateOverridesFromUnknown } from "@/lib/template-overrides";

function parseTemplateOverrides(value: string | null) {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(value) as Project["coverTemplateOverrides"];
	} catch {
		return null;
	}
}

async function getProject(id: string, userId: string): Promise<Project | null> {
	const p = await prisma.project.findFirst({
		where: { id, userId },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
	});
	if (!p) return null;
	return {
		...p,
		coverTemplateOverrides: parseTemplateOverrides(
			p.coverTemplateOverrides,
		),
		contentTemplateOverrides: parseTemplateOverrides(
			p.contentTemplateOverrides,
		),
		createdAt: p.createdAt.toISOString(),
		updatedAt: p.updatedAt.toISOString(),
		projectType: p.projectType as Project["projectType"],
		comicStyle: p.comicStyle as Project["comicStyle"],
		status: p.status as Project["status"],
		pages: p.pages.map((pg: (typeof p.pages)[number]) => ({
			...pg,
			contentTemplateOverrides: parseTemplateOverridesFromUnknown(
				pg.contentTemplateOverrides,
			),
			createdAt: pg.createdAt.toISOString(),
			updatedAt: pg.updatedAt.toISOString(),
		})),
	};
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
	DRAFT: { label: "편집 중", color: "bg-amber-100 text-amber-700" },
	PUBLISHED: { label: "출판 완료", color: "bg-blue-100 text-blue-700" },
	ORDERED: { label: "주문 완료", color: "bg-green-100 text-green-700" },
};

export default async function ViewPage({
	params,
}: {
	params: { projectId: string };
}) {
	const user = await getAuthUserFromCookies();
	if (!user) {
		redirect(
			`/login?next=${encodeURIComponent(`/view/${params.projectId}`)}`,
		);
	}

	const project = await getProject(params.projectId, user.id);
	if (!project) notFound();

	const coverImage =
		project.coverImageUrl ||
		project.pages[0]?.imageUrl ||
		`https://picsum.photos/seed/${project.id}/800/600`;
	const createdLabel = new Date(project.createdAt).toLocaleDateString(
		"ko-KR",
		{
			year: "numeric",
			month: "long",
			day: "numeric",
		},
	);

	const status = STATUS_MAP[project.status] ?? STATUS_MAP.DRAFT;

	return (
		<div className="min-h-screen bg-gradient-to-br from-rose-50 to-purple-50">
			{/* ─── 헤더 ─── */}
			<div className="max-w-4xl mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
				<Link
					href="/"
					className="text-rose-400 text-sm hover:underline"
				>
					← 홈으로
				</Link>
				<span
					className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.color}`}
				>
					{status.label}
				</span>
			</div>

			{/* ─── 표지 히어로 ─── */}
			<div className="max-w-4xl mx-auto px-6 mb-10">
				<div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-lg">
					<Image
						src={coverImage}
						alt={project.title}
						fill
						className="object-cover"
						unoptimized
						priority
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
					<div className="absolute bottom-0 left-0 right-0 p-8 text-white">
						<p className="text-rose-200 text-sm font-medium mb-2">
							{project.projectType === "PHOTOBOOK"
								? "자유 주제 포토북"
								: project.storyCharacters ||
									"등장인물 정보 없음"}
						</p>
						<h1 className="text-3xl md:text-4xl font-serif font-bold mb-2">
							{project.title}
						</h1>
						{project.coverCaption && (
							<p className="text-white/80 text-sm italic">
								&ldquo;{project.coverCaption}&rdquo;
							</p>
						)}
						<p className="text-rose-200 text-xs mt-3">
							{project.projectType === "PHOTOBOOK"
								? `${createdLabel} 생성`
								: project.genre || "AI 생성 콘텐츠"}
							· {project.pages.length}페이지
						</p>
					</div>
				</div>
			</div>

			{/* ─── 페이지 갤러리 ─── */}
			{project.pages.length > 0 ? (
				<div className="max-w-4xl mx-auto px-6 pb-16">
					<h2 className="text-xl font-serif font-bold text-gray-700 mb-6">
						{project.projectType === "PHOTOBOOK"
							? "우리의 이야기"
							: "작품 미리보기"}
					</h2>
					<div className="grid md:grid-cols-2 gap-6">
						{project.pages.map((page, idx) => (
							<div
								key={page.id}
								className="bg-white rounded-2xl overflow-hidden shadow-sm border border-rose-50"
							>
								<div className="relative aspect-[4/3] bg-rose-50">
									<Image
										src={page.imageUrl}
										alt={`페이지 ${idx + 1}`}
										fill
										className="object-cover"
										unoptimized
									/>
									<span className="absolute top-3 left-3 bg-black/40 text-white text-xs font-bold px-2 py-1 rounded-full">
										{idx + 1}
									</span>
								</div>
								{page.caption && (
									<div className="px-5 py-4">
										<p className="text-gray-700 text-sm leading-relaxed">
											{page.caption}
										</p>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			) : (
				<div className="max-w-4xl mx-auto px-6 pb-16 text-center py-20 text-gray-400">
					<p className="text-5xl mb-4">📷</p>
					<p>아직 페이지가 없습니다.</p>
				</div>
			)}

			{/* ─── 하단 액션 ─── */}
			<div className="max-w-4xl mx-auto px-6 pb-16 flex gap-3 justify-center">
				{project.status === "ORDERED" && project.orderUid && (
					<Link
						href={`/status/${project.orderUid}`}
						className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
					>
						📦 배송 현황 확인
					</Link>
				)}
				{project.status === "PUBLISHED" && (
					<Link
						href={`/order/${project.id}`}
						className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
					>
						💳 주문하기
					</Link>
				)}
				{project.status === "DRAFT" && (
					<Link
						href={`/editor/${project.id}`}
						className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
					>
						✏️ 편집하기
					</Link>
				)}
				<Link
					href="/"
					className="bg-white hover:bg-rose-50 border border-rose-200 text-rose-500 font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
				>
					홈으로
				</Link>
			</div>
		</div>
	);
}
