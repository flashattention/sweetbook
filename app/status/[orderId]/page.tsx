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
			<div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
				<div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-sm">
					<p className="text-4xl mb-4">🔍</p>
					<h2 className="text-xl font-bold text-gray-800 mb-2">
						주문을 찾을 수 없어요
					</h2>
					<p className="text-gray-500 text-sm mb-6">
						주문 번호: {orderId}
					</p>
					<HomeLink className="inline-block bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
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
		<div className="min-h-screen bg-gradient-to-br from-rose-50 to-purple-50 p-6">
			<div className="max-w-2xl mx-auto">
				{/* 헤더 */}
				<div className="text-center mb-10">
					<HomeLink className="text-rose-400 text-sm hover:underline">
						← 홈으로
					</HomeLink>
					<div className="mt-6 text-5xl mb-4">
						{currentStatus === "DELIVERED" ? "🎁" : "📦"}
					</div>
					<h1 className="text-2xl font-serif font-bold text-gray-800">
						{currentStatus === "DELIVERED"
							? `${typeLabel}이(가) 도착했어요!`
							: `${typeLabel} 제작 현황`}
					</h1>
					<p className="text-gray-500 text-sm mt-2">
						주문번호:{" "}
						<span className="font-mono text-xs">{orderId}</span>
					</p>
				</div>

				{/* 진행 상태 */}
				<div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 mb-6">
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
													? "bg-rose-300"
													: "bg-gray-200"
											}`}
											style={{ left: "50%" }}
										/>
									)}
									{/* 아이콘 */}
									<div
										className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl mb-2 ${
											isCurrent
												? "bg-rose-500 text-white ring-4 ring-rose-100"
												: isCompleted
													? "bg-rose-200 text-rose-600"
													: "bg-gray-100 text-gray-400"
										}`}
									>
										{step.icon}
									</div>
									<p
										className={`text-xs font-medium text-center ${
											isFuture
												? "text-gray-300"
												: isCurrent
													? "text-rose-600"
													: "text-gray-600"
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
				<div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 mb-6 space-y-3">
					<h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-3 mb-3">
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
						className="flex-1 text-center bg-white hover:bg-rose-50 border border-rose-200 text-rose-500 font-medium py-3 rounded-xl text-sm transition-colors"
					>
						✏️ 수정하기
					</Link>
					<HomeLink className="flex-1 text-center bg-white hover:bg-rose-50 border border-rose-200 text-rose-500 font-medium py-3 rounded-xl text-sm transition-colors">
						홈으로
					</HomeLink>
					<Link
						href={`/view/${project.id}`}
						className="flex-1 text-center bg-rose-500 hover:bg-rose-600 text-white font-medium py-3 rounded-xl text-sm transition-colors"
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
			<span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
			<span
				className={`text-sm font-medium text-gray-800 text-right ${mono ? "font-mono text-xs break-all" : ""}`}
			>
				{value}
			</span>
		</div>
	);
}
