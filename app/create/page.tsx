"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	DEFAULT_IMAGE_MODEL,
	DEFAULT_STORY_MODEL,
	IMAGE_MODEL_OPTIONS,
	STORY_MODEL_OPTIONS,
	estimateOpenAICost,
	type ImageModel,
	type StoryModel,
} from "@/lib/ai-pricing";

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
	const [pageCount, setPageCount] = useState(12);
	const [storyModel, setStoryModel] =
		useState<StoryModel>(DEFAULT_STORY_MODEL);
	const [imageModel, setImageModel] =
		useState<ImageModel>(DEFAULT_IMAGE_MODEL);

	const costEstimate =
		mode === "PHOTOBOOK"
			? null
			: estimateOpenAICost({
					kind: mode === "COMIC" ? "COMIC" : "NOVEL",
					pageCount,
					storyModel,
					imageModel,
				});

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
						coupleNameA: (
							form.elements.namedItem(
								"coupleNameA",
							) as HTMLInputElement
						).value,
						coupleNameB: (
							form.elements.namedItem(
								"coupleNameB",
							) as HTMLInputElement
						).value,
						anniversaryDate: (
							form.elements.namedItem(
								"anniversaryDate",
							) as HTMLInputElement
						).value,
					}
				: {
						projectType: mode,
						title,
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
			router.push(
				mode === "PHOTOBOOK"
					? `/editor/${json.data.id}`
					: `/view/${json.data.id}`,
			);
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
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										이름 A{" "}
										<span className="text-rose-400">*</span>
									</label>
									<input
										name="coupleNameA"
										type="text"
										required
										placeholder="예: 지은"
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									/>
								</div>
								<div>
									<label className="block text-sm font-semibold text-gray-700 mb-1.5">
										이름 B{" "}
										<span className="text-rose-400">*</span>
									</label>
									<input
										name="coupleNameB"
										type="text"
										required
										placeholder="예: 민준"
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									/>
								</div>
							</div>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1.5">
									기념일 날짜{" "}
									<span className="text-rose-400">*</span>
								</label>
								<input
									name="anniversaryDate"
									type="date"
									required
									className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
								/>
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
													4,
													Math.min(
														120,
														Number(
															e.target.value,
														) || 12,
													),
												),
											)
										}
										min={4}
										max={120}
										className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
									/>
								</div>
							</div>

							<div className="grid md:grid-cols-2 gap-3">
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
								<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
									<p className="font-semibold mb-1">
										예상 OpenAI 비용
									</p>
									<p>
										줄거리: $
										{costEstimate.storyUsd.toFixed(4)} (입력{" "}
										{costEstimate.storyInputTokens} / 출력{" "}
										{costEstimate.storyOutputTokens} 토큰
										추정)
									</p>
									{mode === "COMIC" && (
										<p>
											이미지: $
											{costEstimate.imageUsd.toFixed(4)} (
											{costEstimate.imageCount}장)
										</p>
									)}
									<p className="font-semibold mt-1">
										총 예상: $
										{costEstimate.totalUsd.toFixed(4)}
									</p>
									<p className="text-xs text-amber-700 mt-1">
										실제 청구액은 프롬프트 길이와 모델
										정책에 따라 달라질 수 있습니다.
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
