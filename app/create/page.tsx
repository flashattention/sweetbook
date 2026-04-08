"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	convertUsdToKrw,
	DEFAULT_USD_TO_KRW,
	DEFAULT_STORY_MODEL,
	DEFAULT_IMAGE_MODEL,
	IMAGE_MODEL_OPTIONS,
	STORY_MODEL_OPTIONS,
	estimateOpenAICost,
	type ImageModel,
	type StoryModel,
} from "@/lib/ai-pricing";
import {
	DEFAULT_PHOTOBOOK_SPEC_UID,
	SUPPORTED_PHOTOBOOK_SPECS,
	estimateBookProductionCost,
	getSupportedBookSpec,
} from "@/lib/book-specs";

export default function CreatePage() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [mode, setMode] = useState<"PHOTOBOOK" | "COMIC" | "NOVEL">(
		"PHOTOBOOK",
	);
	const [comicStyle, setComicStyle] = useState<
		"MANGA" | "CARTOON" | "AMERICAN" | "PICTURE_BOOK"
	>("MANGA");
	const [bookSpecUid, setBookSpecUid] = useState(DEFAULT_PHOTOBOOK_SPEC_UID);
	const [pageCount, setPageCount] = useState(24);
	const [storyModel, setStoryModel] =
		useState<StoryModel>(DEFAULT_STORY_MODEL);
	const [imageModel, setImageModel] =
		useState<ImageModel>(DEFAULT_IMAGE_MODEL);
	const [usdToKrwRate, setUsdToKrwRate] = useState(DEFAULT_USD_TO_KRW);
	const [exchangeRateMeta, setExchangeRateMeta] = useState<{
		provider: string;
		updatedAt: string | null;
		fallback: boolean;
	}>({
		provider: "fallback",
		updatedAt: null,
		fallback: true,
	});

	const costEstimate =
		mode === "PHOTOBOOK"
			? null
			: estimateOpenAICost({
					kind: mode === "COMIC" ? "COMIC" : "NOVEL",
					pageCount,
					storyModel,
					imageModel,
				});
	const selectedPhotobookSpec = getSupportedBookSpec(bookSpecUid);
	const photobookProductionEstimate = estimateBookProductionCost({
		bookSpecUid,
		requestedPageCount: selectedPhotobookSpec.pageMin,
	});
	const creativeBookProductionEstimate = estimateBookProductionCost({
		bookSpecUid,
		requestedPageCount: pageCount,
	});
	const apiCostKrw = costEstimate
		? convertUsdToKrw(costEstimate.totalUsd, usdToKrwRate)
		: 0;
	const combinedCreativeCostKrw =
		creativeBookProductionEstimate.estimatedPrice + apiCostKrw;

	useEffect(() => {
		let active = true;

		async function loadExchangeRate() {
			try {
				const response = await fetch("/api/exchange-rate", {
					cache: "no-store",
				});
				if (!response.ok) {
					throw new Error(`환율 조회 실패: ${response.status}`);
				}

				const json = (await response.json()) as {
					success: boolean;
					data?: {
						rate?: number;
						provider?: string;
						updatedAt?: string | null;
						fallback?: boolean;
					};
				};

				if (!active || !json.data?.rate) {
					return;
				}

				setUsdToKrwRate(json.data.rate);
				setExchangeRateMeta({
					provider: json.data.provider || "unknown",
					updatedAt: json.data.updatedAt || null,
					fallback: Boolean(json.data.fallback),
				});
			} catch (error) {
				console.error("[CreatePage] exchange rate fetch failed", error);
			}
		}

		void loadExchangeRate();

		return () => {
			active = false;
		};
	}, []);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError("");

		const form = e.currentTarget;
		const title = (form.elements.namedItem("title") as HTMLInputElement)
			.value;

		const data =
			mode === "PHOTOBOOK"
				? {
						projectType: "PHOTOBOOK",
						title,
						bookSpecUid,
					}
				: {
						projectType: mode,
						title,
						bookSpecUid,
						genre: (
							form.elements.namedItem("genre") as HTMLInputElement
						).value,
						characters: (
							form.elements.namedItem(
								"characters",
							) as HTMLInputElement
						).value,
						description: (
							form.elements.namedItem(
								"description",
							) as HTMLTextAreaElement
						).value,
						pageCount: Number(
							(
								form.elements.namedItem(
									"pageCount",
								) as HTMLInputElement
							).value,
						),
						comicStyle: mode === "COMIC" ? comicStyle : undefined,
						storyModel,
						imageModel: mode === "COMIC" ? imageModel : undefined,
					};

		try {
			const res = await fetch("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "프로젝트 생성 실패");
			if (mode === "PHOTOBOOK") {
				router.push(`/editor/${json.data.id}`);
			} else {
				const query = new URLSearchParams({
					storyModel,
					imageModel: mode === "COMIC" ? imageModel : "",
				});
				router.push(
					`/create/progress/${json.data.id}?${query.toString()}`,
				);
			}
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "오류가 발생했습니다.",
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-rose-50 to-purple-50 flex items-center justify-center p-6">
			<div className="w-full max-w-2xl">
				{/* 헤더 */}
				<div className="text-center mb-8">
					<Link
						href="/"
						className="text-rose-400 text-sm hover:underline"
					>
						← 홈으로
					</Link>
					<h1 className="text-3xl font-serif font-bold text-gray-800 mt-4 mb-2">
						새 프로젝트 만들기
					</h1>
					<p className="text-gray-500 text-sm">
						포토북, 만화책, 소설 중 하나를 선택해 시작하세요.
					</p>
				</div>

				<div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-2 mb-4 grid grid-cols-3 gap-2">
					{[
						{ key: "PHOTOBOOK", label: "포토북" },
						{ key: "COMIC", label: "만화책" },
						{ key: "NOVEL", label: "소설" },
					].map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() =>
								setMode(
									item.key as "PHOTOBOOK" | "COMIC" | "NOVEL",
								)
							}
							className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
								mode === item.key
									? "bg-rose-500 text-white"
									: "text-gray-600 hover:bg-rose-50"
							}`}
						>
							{item.label}
						</button>
					))}
				</div>

				{/* 폼 */}
				<form
					onSubmit={handleSubmit}
					className="bg-white rounded-2xl shadow-sm border border-rose-100 p-8 space-y-5"
				>
					{/* 공통 입력 */}
					<div>
						<label className="block text-sm font-semibold text-gray-700 mb-1.5">
							제목 <span className="text-rose-400">*</span>
						</label>
						<input
							name="title"
							type="text"
							required
							placeholder={
								mode === "PHOTOBOOK"
									? "예: 우리의 첫 번째 이야기"
									: "예: 여름의 끝, 소년의 시작"
							}
							className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
						/>
					</div>

					{mode === "PHOTOBOOK" ? (
						<>
							<p className="text-sm text-gray-600 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">
								가족, 졸업, 여행 등 어떤 주제든 자유롭게
								포토북을 만들 수 있어요.
							</p>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1.5">
									포토북 판형{" "}
									<span className="text-rose-400">*</span>
								</label>
								<select
									name="bookSpecUid"
									value={bookSpecUid}
									onChange={(e) =>
										setBookSpecUid(e.target.value)
									}
									className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
								>
									{SUPPORTED_PHOTOBOOK_SPECS.map((spec) => (
										<option
											key={spec.bookSpecUid}
											value={spec.bookSpecUid}
										>
											{spec.name}
										</option>
									))}
								</select>
								<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 mt-3">
									<p className="font-semibold text-slate-900 mb-1">
										선택 판형 안내
									</p>
									<p>{selectedPhotobookSpec.name}</p>
									<p className="mt-1">
										최소 {selectedPhotobookSpec.pageMin}
										페이지, 최대{" "}
										{
											selectedPhotobookSpec.pageMax
										}페이지,{" "}
										{selectedPhotobookSpec.pageIncrement}
										페이지 단위로 제작됩니다.
									</p>
									<p className="mt-1">
										기본 비용: ₩
										{selectedPhotobookSpec.sandboxPriceBase.toLocaleString(
											"ko-KR",
										)}{" "}
										(기본 {selectedPhotobookSpec.pageMin}
										페이지 포함)
									</p>
									<p className="mt-1">
										{selectedPhotobookSpec.pageMin}
										페이지 넘어가는{" "}
										{selectedPhotobookSpec.pageIncrement}
										페이지당 추가 비용: ₩
										{selectedPhotobookSpec.sandboxPricePerIncrement.toLocaleString(
											"ko-KR",
										)}{" "}
										(페이지당 약 ₩
										{(
											selectedPhotobookSpec.sandboxPricePerIncrement /
											selectedPhotobookSpec.pageIncrement
										).toLocaleString("ko-KR")}
										)
									</p>
								</div>
								<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 mt-3">
									<p className="text-xl font-extrabold mb-2 leading-tight">
										예상 비용
									</p>
									<p>
										책 제작비: ₩
										{photobookProductionEstimate.estimatedPrice.toLocaleString(
											"ko-KR",
										)}{" "}
										(출력용{" "}
										{
											photobookProductionEstimate.printablePageCount
										}
										페이지 기준)
									</p>
									<p className="text-xl font-extrabold mt-2 leading-tight">
										총 예상 제작비: ₩
										{photobookProductionEstimate.estimatedPrice.toLocaleString(
											"ko-KR",
										)}
									</p>
									<p className="text-xs text-emerald-700 mt-1">
										Sandbox 단가 기준 추정치이며, 실제
										페이지 구성 후 금액은 달라질 수
										있습니다.
									</p>
								</div>
							</div>
						</>
					) : (
						<>
							<div className="grid md:grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										장르{" "}
										<span className="text-rose-400">*</span>
									</label>
									<input
										name="genre"
										type="text"
										required
										placeholder="예: 로맨스, 성장, 판타지"
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									/>
								</div>
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										페이지 수{" "}
										<span className="text-rose-400">*</span>
									</label>
									<input
										name="pageCount"
										type="number"
										required
										value={pageCount}
										onChange={(e) =>
											setPageCount(
												Math.max(
													selectedPhotobookSpec.pageMin,
													Math.min(
														120,
														Number(
															e.target.value,
														) ||
															selectedPhotobookSpec.pageMin,
													),
												),
											)
										}
										min={selectedPhotobookSpec.pageMin}
										max={120}
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									/>
								</div>
							</div>

							<div className="grid md:grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										책 판형
									</label>
									<select
										name="bookSpecUid"
										value={bookSpecUid}
										onChange={(e) =>
											setBookSpecUid(e.target.value)
										}
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									>
										{SUPPORTED_PHOTOBOOK_SPECS.map(
											(spec) => (
												<option
													key={spec.bookSpecUid}
													value={spec.bookSpecUid}
												>
													{spec.name}
												</option>
											),
										)}
									</select>
									<p className="text-xs text-gray-500 mt-1.5">
										선택한 판형 기준으로 출력용 페이지와
										제작비를 함께 계산합니다.
									</p>
									<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 mt-3">
										<p className="font-semibold text-slate-900 mb-1">
											선택 판형 안내
										</p>
										<p>{selectedPhotobookSpec.name}</p>
										<p className="mt-1">
											최소 {selectedPhotobookSpec.pageMin}
											페이지, 최대{" "}
											{selectedPhotobookSpec.pageMax}
											페이지,
											{
												selectedPhotobookSpec.pageIncrement
											}
											페이지 단위로 제작됩니다.
										</p>
										<p className="mt-1">
											기본 비용: ₩
											{selectedPhotobookSpec.sandboxPriceBase.toLocaleString(
												"ko-KR",
											)}{" "}
											(기본{" "}
											{selectedPhotobookSpec.pageMin}
											페이지 포함)
										</p>
										<p className="mt-1">
											{selectedPhotobookSpec.pageMin}
											페이지 넘어가는{" "}
											{
												selectedPhotobookSpec.pageIncrement
											}
											페이지당 추가 비용: ₩
											{selectedPhotobookSpec.sandboxPricePerIncrement.toLocaleString(
												"ko-KR",
											)}{" "}
											(페이지당 약 ₩
											{(
												selectedPhotobookSpec.sandboxPricePerIncrement /
												selectedPhotobookSpec.pageIncrement
											).toLocaleString("ko-KR")}
											)
										</p>
									</div>
								</div>

								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										줄거리 생성 모델
									</label>
									<select
										value={storyModel}
										onChange={(e) =>
											setStoryModel(
												e.target.value as StoryModel,
											)
										}
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									>
										{STORY_MODEL_OPTIONS.map((option) => (
											<option
												key={option.value}
												value={option.value}
											>
												{option.label}
											</option>
										))}
									</select>
								</div>

								{mode === "COMIC" && (
									<div>
										<label className="block text-sm font-semibold text-gray-700 mb-1.5">
											만화 이미지 생성 모델
										</label>
										<select
											value={imageModel}
											onChange={(e) =>
												setImageModel(
													e.target
														.value as ImageModel,
												)
											}
											className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
										>
											{IMAGE_MODEL_OPTIONS.map(
												(option) => (
													<option
														key={option.value}
														value={option.value}
													>
														{option.label}
													</option>
												),
											)}
										</select>
									</div>
								)}
							</div>

							{mode === "COMIC" && (
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										만화 스타일
									</label>
									<select
										value={comicStyle}
										onChange={(e) =>
											setComicStyle(
												e.target.value as
													| "MANGA"
													| "CARTOON"
													| "AMERICAN"
													| "PICTURE_BOOK",
											)
										}
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									>
										<option value="MANGA">
											일본 만화책 스타일
										</option>
										<option value="CARTOON">
											카툰 스타일
										</option>
										<option value="AMERICAN">
											미국 코믹북 스타일
										</option>
										<option value="PICTURE_BOOK">
											그림책 스타일
										</option>
									</select>
								</div>
							)}

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1.5">
									등장인물(쉼표 구분){" "}
									<span className="text-rose-400">*</span>
								</label>
								<input
									name="characters"
									type="text"
									required
									placeholder="예: 민지, 준호, 담임 선생님"
									className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
								/>
							</div>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1.5">
									줄거리/설명{" "}
									<span className="text-rose-400">*</span>
								</label>
								<textarea
									name="description"
									required
									rows={4}
									placeholder="예: 한국에서 자란 소년이 좌절과 성장을 거쳐 자신의 길을 찾는 이야기"
									className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
								/>
							</div>

							{costEstimate && (
								<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
									<p className="text-xl font-extrabold mb-2 leading-tight">
										예상 비용
									</p>
									<p>
										OpenAI 줄거리: $
										{costEstimate.storyUsd.toFixed(4)} (입력{" "}
										{costEstimate.storyInputTokens} / 출력{" "}
										{costEstimate.storyOutputTokens} 토큰
										추정)
									</p>
									{mode === "COMIC" && (
										<p>
											OpenAI 이미지: $
											{costEstimate.imageUsd.toFixed(4)} (
											{costEstimate.imageCount}장)
										</p>
									)}
									<p>
										API 비용 합계: $
										{costEstimate.totalUsd.toFixed(4)}
										(약 ₩
										{apiCostKrw.toLocaleString("ko-KR")})
									</p>
									<p>
										책 제작비: ₩
										{creativeBookProductionEstimate.estimatedPrice.toLocaleString(
											"ko-KR",
										)}{" "}
										(출력용{" "}
										{
											creativeBookProductionEstimate.printablePageCount
										}
										페이지 기준)
									</p>
									<p className="text-xl font-extrabold mt-2 leading-tight">
										총 예상 제작비: ₩
										{combinedCreativeCostKrw.toLocaleString(
											"ko-KR",
										)}
									</p>
									<p className="text-xs text-emerald-700 mt-1">
										실제 API 청구액은 프롬프트 길이와 모델
										정책에 따라 달라지고, 책 제작비는 선택
										판형의 샌드박스 단가 기준 추정치입니다.
										합산 금액은 $1 = ₩
										{usdToKrwRate.toLocaleString("ko-KR")}{" "}
										기준 환산입니다.
									</p>
									<p className="text-xs text-emerald-700 mt-1">
										환율 출처: {exchangeRateMeta.provider}
										{exchangeRateMeta.updatedAt
											? ` · ${exchangeRateMeta.updatedAt}`
											: ""}
										{exchangeRateMeta.fallback
											? " · 실시간 환율 조회 실패로 기본값 사용"
											: ""}
									</p>
								</div>
							)}
						</>
					)}

					{/* 에러 */}
					{error && (
						<div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
							{error}
						</div>
					)}

					{/* 제출 */}
					<button
						type="submit"
						disabled={loading}
						className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors duration-200"
					>
						{loading
							? "생성 중..."
							: mode === "PHOTOBOOK"
								? "포토북 만들기 시작 →"
								: `${mode === "COMIC" ? "만화책" : "소설"} 자동 생성하기 →`}
					</button>
				</form>

				<p className="text-center text-gray-400 text-xs mt-6">
					{mode === "PHOTOBOOK"
						? "생성 후 에디터에서 사진과 문구를 추가할 수 있어요."
						: "생성 후 AI가 구성한 페이지를 즉시 확인할 수 있어요."}
				</p>
			</div>
		</div>
	);
}
