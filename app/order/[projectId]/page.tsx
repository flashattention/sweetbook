import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import type { Project } from "@/types";
import OrderClient from "./OrderClient";
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
		where: { id, OR: [{ userId }, { isDefault: true }] },
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
		pages: p.pages.map((pg) => ({
			...pg,
			contentTemplateOverrides: parseTemplateOverridesFromUnknown(
				pg.contentTemplateOverrides,
			),
			createdAt: pg.createdAt.toISOString(),
			updatedAt: pg.updatedAt.toISOString(),
		})),
	};
}

export default async function OrderPage({
	params,
}: {
	params: { projectId: string };
}) {
	const user = await getAuthUserFromCookies();
	if (!user) {
		redirect(
			`/login?next=${encodeURIComponent(`/order/${params.projectId}`)}`,
		);
	}

	const project = await getProject(params.projectId, user.id);
	if (!project) notFound();

	// 기본 예시 프로젝트를 다른 사용자가 주문하려는 경우: 클론 후 해당 클론으로 리다이렉트
	if (project.isDefault && project.userId !== user.id) {
		if (!project.bookUid) {
			// bookUid 없으면 주문 불가 — 안내 메시지
			return (
				<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
					<div className="bg-zinc-900 rounded-2xl p-8 text-center max-w-sm border border-white/[0.08]">
						<p className="text-4xl mb-4">📖</p>
						<h2 className="text-xl font-bold text-white mb-2">
							이 예시 프로젝트는 아직 주문할 수 없어요
						</h2>
						<a
							href="/"
							className="inline-block mt-4 text-violet-400 text-sm hover:underline"
						>
							홈으로
						</a>
					</div>
				</div>
			);
		}
		// 이미 이 사용자가 클론을 갖고 있는지 확인
		const existingCopy = project.bookUid
			? await prisma.project.findFirst({
					where: {
						userId: user.id,
						bookUid: project.bookUid,
						isDefault: false,
					},
					select: { id: true },
				})
			: null;
		const copyId =
			existingCopy?.id ??
			(
				await prisma.project.create({
					data: {
						userId: user.id,
						title: project.title,
						projectType: project.projectType,
						genre: project.genre ?? null,
						synopsis: project.synopsis ?? null,
						bookSpecUid: project.bookSpecUid,
						bookUid: project.bookUid,
						coverImageUrl: project.coverImageUrl ?? null,
						coverCaption: project.coverCaption ?? null,
						coverTemplateUid: project.coverTemplateUid ?? null,
						contentTemplateUid: project.contentTemplateUid ?? null,
						coverTemplateOverrides: project.coverTemplateOverrides
							? JSON.stringify(project.coverTemplateOverrides)
							: null,
						contentTemplateOverrides:
							project.contentTemplateOverrides
								? JSON.stringify(
										project.contentTemplateOverrides,
									)
								: null,
						status: project.status,
						pages: {
							createMany: {
								data: project.pages.map((pg) => ({
									pageOrder: pg.pageOrder,
									imageUrl: pg.imageUrl,
									caption: pg.caption,
									contentTemplateUid:
										pg.contentTemplateUid ?? null,
									contentTemplateOverrides:
										pg.contentTemplateOverrides
											? JSON.stringify(
													pg.contentTemplateOverrides,
												)
											: null,
								})),
							},
						},
					},
				})
			).id;
		redirect(`/order/${copyId}`);
	}
	if (project.status === "DRAFT") {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
				<div className="bg-zinc-900 rounded-2xl p-8 text-center max-w-sm border border-white/[0.08]">
					<p className="text-4xl mb-4">📖</p>
					<h2 className="text-xl font-bold text-white mb-2">
						프로젝트가 아직 출판되지 않았어요
					</h2>
					<p className="text-zinc-400 text-sm mb-6">
						먼저 출판을 완료한 뒤 주문해 주세요.
					</p>
					<a
						href={
							project.projectType === "PHOTOBOOK"
								? `/editor/${project.id}`
								: `/view/${project.id}`
						}
						className="inline-block bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
					>
						{project.projectType === "PHOTOBOOK"
							? "에디터로 돌아가기"
							: "보기로 돌아가기"}
					</a>
				</div>
			</div>
		);
	}
	return <OrderClient project={project} />;
}
