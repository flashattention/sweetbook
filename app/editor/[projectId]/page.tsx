import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Project } from "@/types";
import EditorClient from "./EditorClient";

async function getProject(id: string): Promise<Project | null> {
	const p = await prisma.project.findUnique({
		where: { id },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
	});
	if (!p) return null;
	return {
		...p,
		anniversaryDate: p.anniversaryDate.toISOString(),
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
	const project = await getProject(params.projectId);
	if (!project) notFound();
	if (project.projectType !== "PHOTOBOOK") notFound();
	return <EditorClient initialProject={project} />;
}
