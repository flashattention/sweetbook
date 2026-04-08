import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Project } from "@/types";
import OrderClient from "./OrderClient";

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
		status: p.status as Project["status"],
		pages: p.pages.map((pg) => ({
			...pg,
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
	const project = await getProject(params.projectId);
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
