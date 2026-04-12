import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromCookies } from "@/lib/auth";
import type { Project } from "@/types";
import { parseTemplateOverridesFromUnknown } from "@/lib/template-overrides";
import {
	fetchSweetbookTemplateDetail,
	isSweetbookConfigured,
} from "@/lib/sweetbook-api";

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

const TEMPLATE_FINGERPRINT_PARAM_KEY = "__sbTemplateFingerprint";

function normalizeTemplateFieldSearch(...values: Array<unknown>): string {
	return values
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeFieldKey(name: string): string {
	return String(name || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function getTemplateFieldDisplayLabel(name: string): string {
	const key = normalizeFieldKey(name);
	const labelMap: Record<string, string> = {
		covercaption: "표지 문구",
		childname: "아이 이름",
		chldname: "아이 이름",
		schoolname: "기관명",
		booktitle: "책 제목",
		bookname: "책 제목",
		date: "날짜",
		datex: "날짜",
		datea: "날짜",
		dateb: "날짜",
		todaydate: "오늘 날짜",
		createddate: "생성 날짜",
		startdate: "시작 날짜",
		enddate: "종료 날짜",
		datetext: "날짜 문구",
		year: "연도",
		month: "월",
		monthpadded: "월(2자리)",
		monthnamecapitalized: "월 이름",
		monthyearlabel: "연월 표기",
		dayofmonth: "일",
		dayofweek: "요일",
		dayofweekkorean: "요일(한글)",
		pagenumber: "페이지 번호",
		pagenumberpadded: "페이지 번호(2자리)",
		datelabel: "날짜 라벨",
		daylabelx: "날짜 라벨",
		hasdaylabel: "날짜 라벨 표시 여부",
		volumelabel: "권수",
		periodtext: "기록 날짜",
		daterange: "기간",
		title: "제목",
		pagetitle: "페이지 제목",
		pagetext: "페이지 문구",
		contenttext: "본문",
		caption: "페이지 문구",
		subtitle: "부제",
		spinetitle: "등표지 문구",
		monthnum: "월",
		daynum: "일",
		diarytext: "본문",
		fallbacktext: "기본 문구",
		monthcolor: "월 색상",
		pointcolor: "포인트 색상",
		balloon: "말풍선",
		parentballoon: "부모 말풍선",
		teacherballoon: "교사 말풍선",
		childballoon: "아이 말풍선",
		hasballoon: "말풍선 표시 여부",
		parentcomment: "부모 코멘트",
		teachercomment: "교사 코멘트",
		hasparentcomment: "부모 코멘트 표시 여부",
		hasteachercomment: "교사 코멘트 표시 여부",
		weatherlabelx: "날씨 라벨",
		weathervaluex: "날씨 값",
		meallabelx: "급식 라벨",
		mealvaluex: "급식 값",
		naplabelx: "낮잠 라벨",
		napvaluex: "낮잠 값",
		photo: "사진",
		coverphoto: "표지 이미지",
		frontphoto: "표지 이미지",
		collagephotos: "콜라주 이미지",
	};

	if (labelMap[key]) {
		return labelMap[key];
	}

	const search = normalizeTemplateFieldSearch(name);
	const inferRules: Array<{ keywords: string[]; label: string }> = [
		{ keywords: ["parent", "balloon"], label: "부모 말풍선" },
		{ keywords: ["teacher", "balloon"], label: "교사 말풍선" },
		{ keywords: ["child", "balloon"], label: "아이 말풍선" },
		{ keywords: ["balloon"], label: "말풍선" },
		{ keywords: ["parent", "comment"], label: "부모 코멘트" },
		{ keywords: ["teacher", "comment"], label: "교사 코멘트" },
		{ keywords: ["comment"], label: "코멘트" },
		{ keywords: ["day", "of", "week"], label: "요일" },
		{ keywords: ["month", "name"], label: "월 이름" },
		{ keywords: ["month", "year"], label: "연월 표기" },
		{ keywords: ["date", "range"], label: "기간" },
		{ keywords: ["start", "date"], label: "시작 날짜" },
		{ keywords: ["end", "date"], label: "종료 날짜" },
		{ keywords: ["date"], label: "날짜" },
		{ keywords: ["year"], label: "연도" },
		{ keywords: ["month"], label: "월" },
		{ keywords: ["day"], label: "일" },
		{ keywords: ["page", "number"], label: "페이지 번호" },
		{ keywords: ["book", "title"], label: "책 제목" },
		{ keywords: ["title"], label: "제목" },
		{ keywords: ["subtitle"], label: "부제" },
		{ keywords: ["spine", "title"], label: "등표지 문구" },
		{ keywords: ["period"], label: "기록 날짜" },
		{ keywords: ["volume"], label: "권수" },
		{ keywords: ["school"], label: "기관명" },
		{ keywords: ["child", "name"], label: "아이 이름" },
		{ keywords: ["caption"], label: "페이지 문구" },
		{ keywords: ["diary"], label: "본문" },
		{ keywords: ["content"], label: "본문" },
		{ keywords: ["text"], label: "텍스트" },
		{ keywords: ["photo"], label: "사진" },
		{ keywords: ["image"], label: "이미지" },
	];

	for (const rule of inferRules) {
		if (rule.keywords.every((keyword) => search.includes(keyword))) {
			return rule.label;
		}
	}

	return name;
}

function formatTemplateValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "(비어있음)";
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || "(비어있음)";
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

async function getContentTemplateMetaMap(
	templateUids: string[],
): Promise<
	Record<
		string,
		{ name: string; previewUrl: string | null; hasPhotoField: boolean }
	>
> {
	if (templateUids.length === 0 || !isSweetbookConfigured()) {
		return {};
	}

	const uniqueUids = Array.from(
		new Set(
			templateUids.map((uid) => String(uid || "").trim()).filter(Boolean),
		),
	);

	const pickTemplatePreviewUrl = (detail: unknown): string | null => {
		if (!detail || typeof detail !== "object") {
			return null;
		}

		const obj = detail as Record<string, unknown>;
		const thumbnails =
			obj.thumbnails && typeof obj.thumbnails === "object"
				? (obj.thumbnails as Record<string, unknown>)
				: null;

		const candidates = [
			obj.previewUrl,
			obj.previewImageUrl,
			obj.thumbnailUrl,
			obj.imageUrl,
			thumbnails?.layout,
			thumbnails?.cover,
			thumbnails?.main,
			thumbnails?.preview,
		];

		for (const candidate of candidates) {
			if (typeof candidate !== "string") {
				continue;
			}
			const trimmed = candidate.trim();
			if (trimmed) {
				return trimmed;
			}
		}

		return null;
	};

	const results = await Promise.allSettled(
		uniqueUids.map(async (uid) => {
			const detail = await fetchSweetbookTemplateDetail(uid);
			const templateName = String(detail.templateName || "").trim();
			const defEntries = Object.entries(
				(
					(detail as Record<string, unknown>)?.parameters as {
						definitions?: Record<
							string,
							{ binding?: string; label?: string }
						>;
					} | null
				)?.definitions || {},
			);
			const hasPhotoField = defEntries.some(([fieldName, def]) => {
				const binding = String(def?.binding || "").toLowerCase();
				if (binding !== "file") return false;
				const search = normalizeTemplateFieldSearch(
					fieldName,
					def?.label,
					def?.binding,
				);
				if (
					search.includes("coverphoto") ||
					search.includes("frontphoto")
				)
					return false;
				const imageKeywords = [
					"photo",
					"image",
					"picture",
					"img",
					"art",
					"illustration",
					"scene",
					"background",
					"foreground",
					"cut",
					"panel",
					"사진",
					"이미지",
					"그림",
				];
				return imageKeywords.some((kw) => search.includes(kw));
			});
			return {
				uid,
				name: templateName || uid,
				previewUrl: pickTemplatePreviewUrl(detail),
				hasPhotoField,
			};
		}),
	);

	const map: Record<
		string,
		{ name: string; previewUrl: string | null; hasPhotoField: boolean }
	> = {};
	for (const result of results) {
		if (result.status !== "fulfilled") {
			continue;
		}
		map[result.value.uid] = {
			name: result.value.name,
			previewUrl: result.value.previewUrl,
			hasPhotoField: result.value.hasPhotoField,
		};
	}

	return map;
}

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

	const contentTemplateMetaMap = await getContentTemplateMetaMap(
		project.pages
			.map((page) => page.contentTemplateUid || "")
			.filter(Boolean),
	);

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
				<div className="relative w-full rounded-2xl overflow-hidden shadow-lg bg-rose-50">
					<Image
						src={coverImage}
						alt={project.title}
						width={1600}
						height={1200}
						className="block w-full h-auto object-contain"
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
						{project.pages.map((page, idx) =>
							(() => {
								const showPageImage = Boolean(page.imageUrl);
								const templateUid = String(
									page.contentTemplateUid || "",
								).trim();
								const templateMeta =
									contentTemplateMetaMap[templateUid] || null;
								const templateName =
									templateMeta?.name || templateUid;
								const templatePreviewUrl =
									templateMeta?.previewUrl || null;
								const pageOverride =
									parseTemplateOverridesFromUnknown(
										page.contentTemplateOverrides,
									) || null;
								const paramEntries = Object.entries(
									pageOverride?.parameters || {},
								).filter(
									([key]) =>
										key !== TEMPLATE_FINGERPRINT_PARAM_KEY,
								);
								const fileEntries = Object.entries(
									pageOverride?.fileUrls || {},
								);
								const primaryImageUrl =
									project.projectType === "PHOTOBOOK"
										? templatePreviewUrl
										: showPageImage
											? page.imageUrl
											: null;
								return (
									<div
										key={page.id}
										className="bg-white rounded-2xl overflow-hidden shadow-sm border border-rose-50"
									>
										{primaryImageUrl ? (
											<div className="relative bg-rose-50">
												<img
													src={primaryImageUrl}
													alt={`페이지 ${idx + 1} 미리보기`}
													className="block w-full h-auto object-contain"
												/>
												<span className="absolute top-3 left-3 bg-black/40 text-white text-xs font-bold px-2 py-1 rounded-full">
													{idx + 1}
												</span>
												{project.projectType ===
													"PHOTOBOOK" && (
													<span className="absolute top-3 right-3 bg-white/80 text-slate-700 text-[11px] font-semibold px-2 py-1 rounded-full">
														템플릿 미리보기
													</span>
												)}
											</div>
										) : (
											<div className="px-5 pt-4">
												<span className="inline-block bg-rose-100 text-rose-700 text-xs font-bold px-2 py-1 rounded-full">
													{idx + 1}
												</span>
											</div>
										)}
										{page.caption && (
											<div className="px-5 py-4">
												<p className="text-gray-700 text-sm leading-relaxed">
													{page.caption}
												</p>
											</div>
										)}
										{project.projectType ===
											"PHOTOBOOK" && (
											<div className="px-5 pb-5 pt-1 border-t border-rose-50 space-y-3">
												<div>
													<p className="text-[11px] font-semibold text-slate-500 mb-1">
														적용 템플릿
													</p>
													<p className="text-xs text-slate-700 break-all">
														{templateUid
															? templateName
															: "(미선택)"}
													</p>
												</div>

												<div>
													<p className="text-[11px] font-semibold text-slate-500 mb-1">
														페이지 사진
													</p>
													{showPageImage &&
													templateMeta?.hasPhotoField !==
														false ? (
														<div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
															<img
																src={
																	page.imageUrl
																}
																alt={`페이지 ${idx + 1} 사진`}
																className="block w-full h-auto object-contain"
															/>
														</div>
													) : null}
												</div>

												<div>
													<p className="text-[11px] font-semibold text-slate-500 mb-1">
														템플릿 추가 입력값
													</p>
													{paramEntries.length ===
														0 &&
													fileEntries.length === 0 ? (
														<p className="text-xs text-slate-400">
															없음
														</p>
													) : (
														<div className="space-y-1">
															{paramEntries.map(
																([
																	key,
																	value,
																]) => (
																	<div
																		key={`param-${page.id}-${key}`}
																		className="text-xs text-slate-700"
																	>
																		<span className="font-semibold text-slate-500">
																			{getTemplateFieldDisplayLabel(
																				key,
																			)}
																		</span>{" "}
																		:{" "}
																		{formatTemplateValue(
																			value,
																		)}
																	</div>
																),
															)}
															{fileEntries.map(
																([
																	key,
																	value,
																]) => (
																	<div
																		key={`file-${page.id}-${key}`}
																		className="text-xs text-slate-700"
																	>
																		<span className="font-semibold text-slate-500">
																			{getTemplateFieldDisplayLabel(
																				key,
																			)}
																		</span>{" "}
																		:{" "}
																		{formatTemplateValue(
																			value,
																		)}
																	</div>
																),
															)}
														</div>
													)}
												</div>
											</div>
										)}
									</div>
								);
							})(),
						)}
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
				<Link
					href={`/editor/${project.id}`}
					className="bg-white hover:bg-rose-50 border border-rose-200 text-rose-500 font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
				>
					✏️ 수정하기
				</Link>
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
