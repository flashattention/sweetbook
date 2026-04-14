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
