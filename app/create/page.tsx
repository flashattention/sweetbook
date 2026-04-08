"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatePage() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError("");

		const form = e.currentTarget;
		const data = {
			title: (form.elements.namedItem("title") as HTMLInputElement).value,
			coupleNameA: (
				form.elements.namedItem("coupleNameA") as HTMLInputElement
			).value,
			coupleNameB: (
				form.elements.namedItem("coupleNameB") as HTMLInputElement
			).value,
			anniversaryDate: (
				form.elements.namedItem("anniversaryDate") as HTMLInputElement
			).value,
		};

		try {
			const res = await fetch("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "프로젝트 생성 실패");
			router.push(`/editor/${json.data.id}`);
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
			<div className="w-full max-w-md">
				{/* 헤더 */}
				<div className="text-center mb-8">
					<a
						href="/"
						className="text-rose-400 text-sm hover:underline"
					>
						← 홈으로
					</a>
					<h1 className="text-3xl font-serif font-bold text-gray-800 mt-4 mb-2">
						새 포토북 만들기
					</h1>
					<p className="text-gray-500 text-sm">
						커플 정보와 기념일을 입력해 주세요.
					</p>
				</div>

				{/* 폼 */}
				<form
					onSubmit={handleSubmit}
					className="bg-white rounded-2xl shadow-sm border border-rose-100 p-8 space-y-5"
				>
					{/* 포토북 제목 */}
					<div>
						<label className="block text-sm font-semibold text-gray-700 mb-1.5">
							포토북 제목 <span className="text-rose-400">*</span>
						</label>
						<input
							name="title"
							type="text"
							required
							placeholder="예: 우리의 첫 번째 이야기"
							className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
						/>
					</div>

					{/* 커플 이름 */}
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-1.5">
								이름 A <span className="text-rose-400">*</span>
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
								이름 B <span className="text-rose-400">*</span>
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

					{/* 기념일 */}
					<div>
						<label className="block text-sm font-semibold text-gray-700 mb-1.5">
							기념일 날짜 <span className="text-rose-400">*</span>
						</label>
						<input
							name="anniversaryDate"
							type="date"
							required
							className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
						/>
					</div>

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
						{loading ? "생성 중..." : "포토북 만들기 시작 →"}
					</button>
				</form>

				<p className="text-center text-gray-400 text-xs mt-6">
					생성 후 에디터에서 사진과 문구를 추가할 수 있어요.
				</p>
			</div>
		</div>
	);
}
