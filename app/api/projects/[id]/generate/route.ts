import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
	ComicStyle,
	MissingOpenAIKeyError,
	NovelOutline,
	generateBookPlan,
	generateComicImages,
	generateStoryCoverImage,
	type CharacterImageRef,
} from "@/lib/ai-generator";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	isImageModel,
	isStoryModel,
	calcStoryActualCostUsd,
	IMAGE_PRICING_PER_IMAGE_USD,
	estimateOpenAICost,
	usdToCredits,
	type ImageModel,
} from "@/lib/ai-pricing";
import { isSweetbookConfigured } from "@/lib/sweetbook-api";

/** 이 시간(ms) 이상 업데이트가 없으면 함수가 중단된 것으로 판단 */
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5분

const ACTIVE_STAGES = [
	"PLANNING",
	"WRITING",
	"SAVING",
	"PUBLISHING",
	"IMAGING",
];

function isActiveGenerationStage(stage: string | null | undefined): boolean {
	if (!stage) return false;
	return ACTIVE_STAGES.some((s) => stage.startsWith(s));
}

function isStuckGeneration(
	stage: string | null | undefined,
	updatedAt: Date,
): boolean {
	if (!isActiveGenerationStage(stage)) return false;
	return Date.now() - updatedAt.getTime() > STUCK_THRESHOLD_MS;
}

function parseGenerationMetadata(raw: string | null | undefined): {
	outline?: NovelOutline;
} | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as { outline?: NovelOutline };
	} catch {
		return null;
	}
}

function toComicStyle(value: string | null | undefined): ComicStyle {
	return value === "CARTOON" ||
		value === "AMERICAN" ||
		value === "PICTURE_BOOK"
		? value
		: "MANGA";
}

function isOpenAIQuotaExceededError(error: unknown): boolean {
	const e = error as {
		status?: number;
		code?: string;
		error?: { code?: string; message?: string };
		message?: string;
	};

	const status = Number(e?.status);
	const code = String(e?.code || e?.error?.code || "").toLowerCase();
	const message = String(e?.message || e?.error?.message || "").toLowerCase();

	return (
		status === 429 &&
		(code.includes("insufficient_quota") ||
			message.includes("insufficient_quota") ||
			message.includes("current quota") ||
			message.includes("quota exceeded"))
	);
}

// POST /api/projects/[id]/generate
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const user = await getAuthUserFromRequest(req);
		if (!user) {
			return NextResponse.json(
				{ success: false, error: "로그인이 필요합니다." },
				{ status: 401 },
			);
		}

		const body = await req.json().catch(() => ({}));
		const storyModel = isStoryModel(body?.storyModel)
			? body.storyModel
			: DEFAULT_STORY_MODEL;
		const imageModel: ImageModel = isImageModel(body?.imageModel)
			? body.imageModel
			: DEFAULT_IMAGE_MODEL;

		const project = await prisma.project.findFirst({
			where: { id: params.id, userId: user.id },
			include: { pages: { orderBy: { pageOrder: "asc" } } },
		});
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "프로젝트를 찾을 수 없습니다." },
				{ status: 404 },
			);
		}

		const characterImages: CharacterImageRef[] = (() => {
			try {
				const raw = (
					project as unknown as {
						characterImagesJson?: string | null;
					}
				).characterImagesJson;
				if (!raw) return [];
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) return [];
				return parsed.filter(
					(item): item is CharacterImageRef =>
						item &&
						typeof item.name === "string" &&
						typeof item.imageUrl === "string",
				);
			} catch {
				return [];
			}
		})();

		if (project.projectType === "PHOTOBOOK") {
			return NextResponse.json(
				{ success: false, error: "포토북 프로젝트는 대상이 아닙니다." },
				{ status: 400 },
			);
		}

		if (project.status === "PUBLISHED" && project.pages.length > 0) {
			return NextResponse.json({ success: true, data: project });
		}

		// ── resume 여부 판단 ──────────────────────────────────────────────
		const projectMeta = project as unknown as {
			generationMetadata?: string | null;
			updatedAt: Date;
		};

		// (1) stuck: active 스테이지가 5분 이상 멈춰있는 경우
		// (2) failedResume: FAILED 상태이고 이미 크레딧이 차감된 기록이 있는 경우
		//     → 어느 단계에서 실패했든 크레딧 재차감 없이 이어서 진행
		const isResume = isStuckGeneration(
			project.generationStage,
			projectMeta.updatedAt,
		);

		const existingCharge =
			project.generationStage === "FAILED"
				? await (prisma as any).creditTransaction.findFirst({
						where: {
							projectId: project.id,
							reason: "GENERATE_AI",
							amount: { lt: 0 },
						},
					})
				: null;
		const isFailedResume =
			project.generationStage === "FAILED" && !!existingCharge;

		// 페이지가 이미 저장돼 있으면 SAVING 이후 단계(PUBLISHING)만 재시도
		const savedPages = project.pages as Array<{
			pageOrder: number;
			caption: string;
			imageUrl?: string;
		}>;
		const canSkipToPublish =
			isFailedResume &&
			savedPages.length > 0 &&
			savedPages.every((p) => (p as any).imageUrl);

		const normalizedType =
			project.projectType === "NOVEL" ? "NOVEL" : "COMIC";
		const pageCount = Math.max(
			24,
			Math.min(
				120,
				(project as { requestedPageCount?: number | null })
					.requestedPageCount || 24,
			),
		);
		const refImageCount = (() => {
			try {
				const raw = (project as any).characterImagesJson;
				if (!raw) return 0;
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? parsed.length : 0;
			} catch {
				return 0;
			}
		})();

		// ── 크레딧 확인 및 선차감 (resume 시 생략) ───────────────────────
		const costEstimate = estimateOpenAICost({
			kind: normalizedType,
			pageCount,
			storyModel,
			imageModel,
			refImageCount,
		});
		const requiredCredits = usdToCredits(costEstimate.totalUsd);
		let creditDeducted = false;

		if (!isResume && !isFailedResume) {
			const userBefore = await (prisma.user as any).findUnique({
				where: { id: user.id },
				select: { credits: true },
			});
			if (!userBefore || (userBefore.credits ?? 0) < requiredCredits) {
				return NextResponse.json(
					{
						success: false,
						error: "크레딧이 부족합니다.",
						required: requiredCredits,
						current: userBefore?.credits ?? 0,
					},
					{ status: 402 },
				);
			}
			await (prisma as any).$transaction([
				(prisma.user as any).update({
					where: { id: user.id },
					data: { credits: { decrement: requiredCredits } },
				}),
				(prisma as any).creditTransaction.create({
					data: {
						userId: user.id,
						amount: -requiredCredits,
						reason: "GENERATE_AI",
						projectId: project.id,
					},
				}),
			]);
			creditDeducted = true;
		}

		try {
			// ── FAILED 재시도: 페이지가 이미 저장돼 있으면 PUBLISHING만 재시도 ──
			if (canSkipToPublish) {
				console.log(
					`[generate] skip-to-publish: projectId=${project.id}, pages=${savedPages.length}`,
				);
				await prisma.project.update({
					where: { id: project.id },
					data: {
						generationStage: "PUBLISHING",
						generationProgress: 96,
						generationError: null,
					} as any,
				});

				const publishRes = await fetch(
					`${req.nextUrl.origin}/api/projects/${project.id}/publish`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							cookie: req.headers.get("cookie") || "",
						},
						body: JSON.stringify({}),
					},
				);
				const publishJson = (await publishRes
					.json()
					.catch(() => ({}))) as {
					success?: boolean;
					error?: string;
					bookUid?: string;
					failedStep?: string;
				};
				if (!publishRes.ok || !publishJson.success) {
					const baseMsg =
						publishJson.error || "출판 단계에서 실패했습니다.";
					const stepInfo = publishJson.failedStep
						? ` [단계: ${publishJson.failedStep}]`
						: "";
					throw new Error(baseMsg + stepInfo);
				}

				await prisma.project.update({
					where: { id: project.id },
					data: {
						generationStage: "COMPLETED",
						generationProgress: 100,
						generationError: null,
						generationMetadata: null,
					} as any,
				});

				const updated = await prisma.project.findUnique({
					where: { id: project.id },
					include: { pages: { orderBy: { pageOrder: "asc" } } },
				});
				return NextResponse.json({ success: true, data: updated });
			}

			// ── resume: 아웃라인 + 저장된 페이지 로드 ────────────────────
			let existingOutline: NovelOutline | undefined;
			let resumeFromPageIndex = 0;
			const existingPages: Array<{ pageOrder: number; caption: string }> =
				[];

			if (isResume && normalizedType === "NOVEL") {
				const meta = parseGenerationMetadata(
					projectMeta.generationMetadata,
				);
				existingOutline = meta?.outline;

				for (const p of project.pages) {
					existingPages.push({
						pageOrder: p.pageOrder,
						caption: p.caption || "",
					});
				}
				resumeFromPageIndex = existingPages.length;

				console.log(
					`[generate] resume: projectId=${project.id}, ` +
						`savedPages=${existingPages.length}/${pageCount}, ` +
						`hasOutline=${!!existingOutline}`,
				);
			}

			// COMIC resume: DB에 저장된 이미지 URL을 주입 (Vercel /tmp 유실 대비)
			let savedComicPageImageUrls: Record<number, string> | undefined;
			let savedCoverImageUrl: string | undefined;
			if ((isResume || isFailedResume) && normalizedType === "COMIC") {
				savedCoverImageUrl = project.coverImageUrl || undefined;
				savedComicPageImageUrls = {};
				for (const p of project.pages) {
					if (p.imageUrl) {
						savedComicPageImageUrls[p.pageOrder] = p.imageUrl;
					}
				}
				const savedCount = Object.keys(savedComicPageImageUrls).length;
				console.log(
					`[generate] comic-resume: projectId=${project.id}, savedImages=${savedCount}/${pageCount}`,
				);
			}

			// ── 스테이지 초기화 ───────────────────────────────────────────
			if (!isResume && !isFailedResume) {
				await prisma.project.update({
					where: { id: project.id },
					data: {
						generationStage: "PLANNING",
						generationProgress: 10,
						generationError: null,
					} as any,
				});
			} else {
				// resume / failedResume: 에러 메시지만 초기화
				await prisma.project.update({
					where: { id: project.id },
					data: { generationError: null } as any,
				});
			}

			const comicStyle = toComicStyle(project.comicStyle);
			let runningCostUsd = 0;

			const plan = await generateBookPlan(
				{
					title: project.title,
					characters: project.storyCharacters || "주인공",
					genre: project.genre || "일반",
					description: project.synopsis || "",
					pageCount,
					bookKind: normalizedType,
					comicStyle,
				},
				{
					storyModel,
					existingOutline,
					resumeFromPageIndex,
					existingPages,
					onNovelPageDone: async (done, total, usage, page) => {
						if (normalizedType !== "NOVEL") return;

						// done=0 이면 아웃라인 완료 시점 (첫 PLANNING→WRITING 전환)
						// 이 시점에는 아직 page가 없으므로 스테이지만 업데이트
						if (done === 0) return;

						const safeTotal = Math.max(1, total);
						const safeDone = Math.max(0, Math.min(done, safeTotal));
						runningCostUsd = calcStoryActualCostUsd(
							usage,
							storyModel,
						);

						// 방금 생성된 페이지 즉시 upsert (중단 대비 증분 저장)
						if (page) {
							await (prisma as any).page.upsert({
								where: {
									projectId_pageOrder: {
										projectId: project.id,
										pageOrder: page.pageOrder,
									},
								},
								create: {
									projectId: project.id,
									pageOrder: page.pageOrder,
									caption: page.caption,
									imageUrl: "",
								},
								update: { caption: page.caption },
							});
						}

						const progress =
							12 + Math.floor((safeDone / safeTotal) * 76);
						await prisma.project.update({
							where: { id: project.id },
							data: {
								generationStage: `WRITING:${safeDone}:${safeTotal}`,
								generationProgress: progress,
								generationCostUsd: runningCostUsd,
							} as any,
						});
					},
				},
			);

			// ── 소설 아웃라인을 generationMetadata에 저장 (첫 실행 시) ────
			// 중단 시 재개에서 outline API 호출을 건너뛸 수 있도록 캐시.
			if (normalizedType === "NOVEL" && !isResume && !isFailedResume) {
				const outlineCache: NovelOutline = {
					tagline: plan.tagline,
					synopsis: plan.synopsis,
					characterProfiles: plan.characterProfiles,
					chapters: plan.chapters,
					// pageBlueprints: 재개 시 synopsis+characters로 재생성하므로 생략
					pageBlueprints: [],
				};
				await prisma.project.update({
					where: { id: project.id },
					data: {
						generationMetadata: JSON.stringify({
							outline: outlineCache,
						}),
						synopsis: plan.synopsis,
					} as any,
				});
			}

			// 스토리 생성 비용 최종 갱신
			runningCostUsd = calcStoryActualCostUsd(
				plan.actualUsage,
				storyModel,
			);
			await prisma.project.update({
				where: { id: project.id },
				data: { generationCostUsd: runningCostUsd } as any,
			});

			let coverImageUrl = `https://picsum.photos/seed/${encodeURIComponent(project.title)}-cover/900/700`;
			let pageImageUrls: string[] = [];

			if (normalizedType === "COMIC") {
				pageImageUrls = plan.pages.map(
					(page) =>
						`https://picsum.photos/seed/${encodeURIComponent(project.title)}-${page.pageOrder}/900/700`,
				);
				const totalPages = plan.pages.length;
				await prisma.project.update({
					where: { id: project.id },
					data: {
						generationStage: `IMAGING:0:${totalPages}`,
						generationProgress: 35,
					} as any,
				});
				let lastDoneCount = 0;

				const generatedImages = await generateComicImages({
					title: project.title,
					synopsis: plan.synopsis,
					comicStyle,
					pages: plan.pages,
					characterProfiles: plan.characterProfiles,
					imageModel,
					characterImages,
					// 분당 5장 제한 모델(dall-e-3, dall-e-3-hd, gpt-image-1, gpt-image-1-hd)은
					// ai-generator.ts에서 maxParallel=1로 강제하지만, 의도를 명확히 표기
					maxParallel:
						imageModel === "dall-e-2"
							? 6
							: imageModel === "gpt-image-1" ||
								  imageModel === "gpt-image-1-hd" ||
								  imageModel === "dall-e-3" ||
								  imageModel === "dall-e-3-hd"
								? 1
								: 3,
					retryCount: 3,
					checkpointKey: project.id,
					savedPageImageUrls: savedComicPageImageUrls,
					savedCoverImageUrl,
					onPageDone: async (done, total, page) => {
						const progress = 35 + Math.floor((done / total) * 50);
						const delta = Math.max(0, done - lastDoneCount);
						lastDoneCount = done;
						if (delta > 0) {
							runningCostUsd +=
								delta * IMAGE_PRICING_PER_IMAGE_USD[imageModel];
						}
						const updates: Promise<unknown>[] = [
							prisma.project.update({
								where: { id: project.id },
								data: {
									generationStage: `IMAGING:${done}:${total}`,
									generationProgress: progress,
									generationCostUsd: runningCostUsd,
								} as any,
							}),
						];
						// 이미지 생성 즉시 DB upsert (중단 시 resume 대비)
						if (page) {
							const planPage = plan.pages.find(
								(p) => p.pageOrder === page.pageOrder,
							);
							updates.push(
								(prisma as any).page.upsert({
									where: {
										projectId_pageOrder: {
											projectId: project.id,
											pageOrder: page.pageOrder,
										},
									},
									create: {
										projectId: project.id,
										pageOrder: page.pageOrder,
										caption: planPage?.caption || "",
										imageUrl: page.imageUrl,
									},
									update: { imageUrl: page.imageUrl },
								}),
							);
						}
						await Promise.all(updates);
					},
				});
				// 표지 이미지 비용 누적 (+1)
				runningCostUsd += IMAGE_PRICING_PER_IMAGE_USD[imageModel];
				coverImageUrl = generatedImages.coverImageUrl;
				pageImageUrls = generatedImages.pageImageUrls;
			} else {
				const generatedCoverImageUrl = await generateStoryCoverImage({
					title: project.title,
					synopsis: plan.synopsis,
					genre: project.genre || undefined,
					imageModel,
				});
				coverImageUrl = generatedCoverImageUrl;
			}

			// ── SAVING ───────────────────────────────────────────────────
			await prisma.project.update({
				where: { id: project.id },
				data: {
					generationStage: "SAVING",
					generationProgress: 92,
				} as any,
			});

			if (normalizedType === "NOVEL") {
				// 소설 페이지는 onNovelPageDone에서 이미 증분 upsert 완료.
				// cover/synopsis 등 메타데이터만 업데이트.
				await prisma.project.update({
					where: { id: project.id },
					data: {
						synopsis: plan.synopsis,
						coverCaption: plan.tagline,
						coverImageUrl,
					} as any,
				});
			} else {
				// 만화: 일괄 저장
				await prisma.project.update({
					where: { id: project.id },
					data: {
						synopsis: plan.synopsis,
						coverCaption: plan.tagline,
						coverImageUrl,
						comicStyle,
						pages: {
							deleteMany: {},
							create: plan.pages.map((page, index) => ({
								pageOrder: page.pageOrder,
								caption: page.caption,
								imageUrl:
									pageImageUrls[index] ||
									`https://picsum.photos/seed/${encodeURIComponent(project.title)}-${page.pageOrder}/900/700`,
							})),
						},
					} as any,
				});
			}

			await prisma.project.update({
				where: { id: project.id },
				data: {
					generationStage: "PUBLISHING",
					generationProgress: 96,
				} as any,
			});

			const publishRes = await fetch(
				`${req.nextUrl.origin}/api/projects/${project.id}/publish`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						cookie: req.headers.get("cookie") || "",
					},
					body: JSON.stringify({}),
				},
			);
			const publishJson = (await publishRes.json().catch(() => ({}))) as {
				success?: boolean;
				error?: string;
				bookUid?: string;
				failedStep?: string;
			};
			if (!publishRes.ok || !publishJson.success) {
				const baseMsg =
					publishJson.error ||
					"출판 단계에서 실패했습니다. 잠시 후 다시 시도해 주세요.";
				const stepInfo = publishJson.failedStep
					? ` [단계: ${publishJson.failedStep}]`
					: "";
				throw new Error(baseMsg + stepInfo);
			}
			if (isSweetbookConfigured() && !publishJson.bookUid) {
				throw new Error(
					"출판은 성공했지만 bookUid를 받지 못했습니다. 템플릿/API 설정을 확인해 주세요.",
				);
			}

			// 완료 — generationMetadata 클리어
			await prisma.project.update({
				where: { id: project.id },
				data: {
					generationStage: "COMPLETED",
					generationProgress: 100,
					generationError: null,
					generationMetadata: null,
				} as any,
			});

			const updated = await prisma.project.findUnique({
				where: { id: project.id },
				include: { pages: { orderBy: { pageOrder: "asc" } } },
			});

			creditDeducted = false; // 성공 — 환불 불필요
			return NextResponse.json({ success: true, data: updated });
		} catch (innerErr) {
			// 생성 실패 시 차감 크레딧 환불
			if (creditDeducted) {
				await (prisma as any)
					.$transaction([
						(prisma.user as any).update({
							where: { id: user.id },
							data: { credits: { increment: requiredCredits } },
						}),
						(prisma as any).creditTransaction.create({
							data: {
								userId: user.id,
								amount: requiredCredits,
								reason: "REFUND",
								projectId: project.id,
							},
						}),
					])
					.catch(() => {});
			}
			throw innerErr;
		}
	} catch (err) {
		if (err instanceof MissingOpenAIKeyError) {
			return NextResponse.json(
				{ success: false, error: err.message },
				{ status: 400 },
			);
		}

		const isQuotaExceeded = isOpenAIQuotaExceededError(err);
		const message = isQuotaExceeded
			? "OpenAI API 크레딧이 부족합니다. 충전 후 홈에서 다시 시도해 주세요."
			: err instanceof Error
				? err.message
				: "스토리 생성 실패";
		console.error("[POST /api/projects/[id]/generate]", err);
		await prisma.project
			.update({
				where: { id: params.id },
				data: {
					generationStage: "FAILED",
					generationError: message,
				} as any,
			})
			.catch(() => {});
		return NextResponse.json(
			{
				success: false,
				error: message,
				errorCode: isQuotaExceeded
					? "OPENAI_QUOTA_EXCEEDED"
					: undefined,
			},
			{ status: isQuotaExceeded ? 429 : 500 },
		);
	}
}
