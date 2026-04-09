"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginClient() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const nextPath = searchParams.get("next") || "/";
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
			const json = (await res.json()) as {
				success: boolean;
				error?: string;
			};
			if (!res.ok || !json.success) {
				throw new Error(json.error || "로그인 실패");
			}
			router.push(nextPath);
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "로그인 실패");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
			<div className="w-full max-w-md bg-white rounded-2xl border border-rose-100 shadow-sm p-8">
				<h1 className="text-2xl font-bold text-gray-800 mb-2">
					로그인
				</h1>
				<p className="text-sm text-gray-500 mb-6">
					계정으로 로그인하고 내 프로젝트를 관리하세요.
				</p>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							이메일
						</label>
						<input
							type="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							비밀번호
						</label>
						<input
							type="password"
							required
							minLength={8}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
						/>
					</div>

					{error && (
						<p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
					>
						{loading ? "로그인 중..." : "로그인"}
					</button>
				</form>

				<p className="text-sm text-gray-500 mt-5 text-center">
					아직 계정이 없나요?{" "}
					<Link
						href="/signup"
						className="text-rose-500 hover:underline"
					>
						회원가입
					</Link>
				</p>
			</div>
		</div>
	);
}
