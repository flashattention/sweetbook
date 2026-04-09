import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import type { Project } from "@/types";
import EditorClient from "./EditorClient";

async function getProject(id: string, userId: string): Promise<Project | null> {
	const p = await prisma.project.findFirst({
		where: { id, userId },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
	});
	if (!p) return null;
	return {
		...p,
		createdAt: p.createdAt.toISOString(),
		updatedAt: p.updatedAt.toISOString(),
		projectType: p.projectType as Project["projectType"],
		comicStyle: p.comicStyle as Project["comicStyle"],
		status: p.status as Project["status"],
		pages: p.pages.map((pg) => ({
			...pg,
			createdAt: pg.createdAt.toISOString(),
			updatedAt: pg.updatedAt.toISOString(),
		})),
	};
}

export default async function EditorPage({
	params,
}: {
	params: { projectId: string };
}) {
	const user = await getAuthUserFromCookies();
	if (!user) {
		redirect(
			`/login?next=${encodeURIComponent(`/editor/${params.projectId}`)}`,
		);
	}

	const project = await getProject(params.projectId, user.id);
	if (!project) notFound();
	if (project.projectType !== "PHOTOBOOK") notFound();
	return <EditorClient initialProject={project} />;
}
