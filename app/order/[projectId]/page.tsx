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
			<div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
				<div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-sm">
					<p className="text-4xl mb-4">📖</p>
					<h2 className="text-xl font-bold text-gray-800 mb-2">
						포토북이 아직 출판되지 않았어요
					</h2>
					<p className="text-gray-500 text-sm mb-6">
						에디터에서 먼저 출판하기를 눌러주세요.
					</p>
					<a
						href={`/editor/${project.id}`}
						className="inline-block bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
					>
						에디터로 돌아가기
					</a>
				</div>
			</div>
		);
	}
	return <OrderClient project={project} />;
}
