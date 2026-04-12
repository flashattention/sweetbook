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
		<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
			<div className="w-full max-w-md bg-zinc-900 rounded-2xl border border-white/[0.08] shadow-xl p-8">
				<h1 className="text-2xl font-bold text-white mb-2">로그인</h1>
				<p className="text-sm text-zinc-400 mb-6">
					계정으로 로그인하고 내 프로젝트를 관리하세요.
				</p>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-zinc-300 mb-1">
							이메일
						</label>
						<input
							type="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-zinc-300 mb-1">
							비밀번호
						</label>
						<input
							type="password"
							required
							minLength={8}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
						/>
					</div>

					{error && (
						<p className="text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
					>
						{loading ? "로그인 중..." : "로그인"}
					</button>
				</form>

				<p className="text-sm text-zinc-400 mt-5 text-center">
					아직 계정이 없나요?{" "}
					<Link
						href="/signup"
						className="text-violet-400 hover:underline"
					>
						회원가입
					</Link>
				</p>
			</div>
		</div>
	);
}
