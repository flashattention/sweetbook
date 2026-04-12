import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import HomeLink from "./HomeLink";

const STEPS = [
	{ key: "PENDING", label: "주문 접수", icon: "📋" },
	{ key: "PROCESSING", label: "제작 중", icon: "🖨️" },
	{ key: "SHIPPING", label: "배송 중", icon: "🚚" },
	{ key: "DELIVERED", label: "배달 완료", icon: "🎉" },
];

function getProjectTypeLabel(projectType: string): string {
	if (projectType === "COMIC") return "만화책";
	if (projectType === "NOVEL") return "소설";
	return "포토북";
}

function getProjectSubject(project: {
	projectType: string;
	genre: string | null;
	synopsis: string | null;
	coverCaption: string | null;
	title: string;
}): string {
	return (
		project.genre ||
		project.synopsis ||
		project.coverCaption ||
		project.title
	);
}

async function getOrderData(orderUid: string, userId: string) {
	// 로컬 DB에서 프로젝트 + 주문 정보 조회
	const project = await prisma.project.findFirst({
		where: { orderUid, userId },
	});
	return project;
}

export default async function StatusPage({
	params,
}: {
	params: { orderId: string };
}) {
	const user = await getAuthUserFromCookies();
	if (!user) {
		redirect(
			`/login?next=${encodeURIComponent(`/status/${params.orderId}`)}`,
		);
	}

	const { orderId } = params;
	const project = await getOrderData(orderId, user.id);

	if (!project) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
				<div className="bg-zinc-900 rounded-2xl p-8 text-center max-w-sm border border-white/[0.08]">
					<p className="text-4xl mb-4">🔍</p>
					<h2 className="text-xl font-bold text-white mb-2">
						주문을 찾을 수 없어요
					</h2>
					<p className="text-zinc-400 text-sm mb-6">
						주문 번호: {orderId}
					</p>
					<HomeLink className="inline-block bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
						홈으로
					</HomeLink>
				</div>
			</div>
		);
	}

	const currentStatus = project.orderStatus || "PENDING";
	const currentStepIdx = STEPS.findIndex((s) => s.key === currentStatus);
	const typeLabel = getProjectTypeLabel(project.projectType);
	const subjectText = getProjectSubject(project);

	const createdDate = new Date(project.createdAt).toLocaleDateString(
		"ko-KR",
		{
			year: "numeric",
			month: "long",
			day: "numeric",
		},
	);

	return (
		<div className="min-h-screen bg-zinc-950 p-6">
			<div className="max-w-2xl mx-auto">
				{/* 헤더 */}
				<div className="text-center mb-10">
					<HomeLink className="text-violet-400 text-sm hover:underline">
						← 홈으로
					</HomeLink>
					<div className="mt-6 text-5xl mb-4">
						{currentStatus === "DELIVERED" ? "🎁" : "📦"}
					</div>
					<h1 className="text-2xl font-bold text-white">
						{currentStatus === "DELIVERED"
							? `${typeLabel}이(가) 도착했어요!`
							: `${typeLabel} 제작 현황`}
					</h1>
					<p className="text-zinc-400 text-sm mt-2">
						주문번호:{" "}
						<span className="font-mono text-xs">{orderId}</span>
					</p>
				</div>

				{/* 진행 상태 */}
				<div className="bg-zinc-900 rounded-2xl shadow-sm border border-white/[0.08] p-6 mb-6">
					<div className="flex items-center justify-between">
						{STEPS.map((step, idx) => {
							const isCompleted = idx < currentStepIdx;
							const isCurrent = idx === currentStepIdx;
							const isFuture = idx > currentStepIdx;
							return (
								<div
									key={step.key}
									className="flex-1 flex flex-col items-center relative"
								>
									{/* 연결선 */}
									{idx < STEPS.length - 1 && (
										<div
											className={`absolute top-5 left-1/2 w-full h-0.5 ${
												isCompleted || isCurrent
													? "bg-violet-500"
													: "bg-zinc-700"
											}`}
											style={{ left: "50%" }}
										/>
									)}
									{/* 아이콘 */}
									<div
										className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl mb-2 ${
											isCurrent
												? "bg-violet-600 text-white ring-4 ring-violet-500/30"
												: isCompleted
													? "bg-violet-900/60 text-violet-300"
													: "bg-zinc-800 text-zinc-500"
										}`}
									>
										{step.icon}
									</div>
									<p
										className={`text-xs font-medium text-center ${
											isFuture
												? "text-zinc-600"
												: isCurrent
													? "text-violet-400"
													: "text-zinc-400"
										}`}
									>
										{step.label}
									</p>
								</div>
							);
						})}
					</div>
				</div>

				{/* 주문 상세 */}
				<div className="bg-zinc-900 rounded-2xl shadow-sm border border-white/[0.08] p-6 mb-6 space-y-3">
					<h2 className="text-base font-bold text-white border-b border-white/[0.08] pb-3 mb-3">
						주문 정보
					</h2>
					<DetailRow
						label={`${typeLabel} 제목`}
						value={project.title}
					/>
					<DetailRow label="주제" value={subjectText} />
					<DetailRow label="생성일" value={createdDate} />
					{project.bookUid && (
						<DetailRow
							label="Book UID"
							value={project.bookUid}
							mono
						/>
					)}
					{project.trackingInfo && (
						<DetailRow
							label="송장번호"
							value={project.trackingInfo}
						/>
					)}
				</div>

				{/* 버튼 */}
				<div className="flex gap-3">
					<Link
						href={`/editor/${project.id}`}
						className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 border border-white/[0.08] text-zinc-300 font-medium py-3 rounded-xl text-sm transition-colors"
					>
						✏️ 수정하기
					</Link>
					<HomeLink className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 border border-white/[0.08] text-zinc-300 font-medium py-3 rounded-xl text-sm transition-colors">
						홈으로
					</HomeLink>
					<Link
						href={`/view/${project.id}`}
						className="flex-1 text-center bg-violet-600 hover:bg-violet-500 text-white font-medium py-3 rounded-xl text-sm transition-colors"
					>
						📖 {typeLabel} 보기
					</Link>
				</div>
			</div>
		</div>
	);
}

function DetailRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<span className="text-sm text-zinc-400 flex-shrink-0">{label}</span>
			<span
				className={`text-sm font-medium text-zinc-200 text-right ${mono ? "font-mono text-xs break-all" : ""}`}
			>
				{value}
			</span>
		</div>
	);
}
