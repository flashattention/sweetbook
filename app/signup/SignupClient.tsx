"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SignupClient() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const nextPath = searchParams.get("next") || "/";
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	function isStrongPassword(value: string): boolean {
		return (
			value.length >= 8 &&
			/[A-Za-z]/.test(value) &&
			/\d/.test(value) &&
			/[^A-Za-z0-9]/.test(value)
		);
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError("");

		if (!isStrongPassword(password)) {
			setError(
				"비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 모두 포함해야 합니다.",
			);
			setLoading(false);
			return;
		}
		if (password !== confirmPassword) {
			setError("비밀번호 확인 값이 일치하지 않습니다.");
			setLoading(false);
			return;
		}

		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					email,
					password,
					confirmPassword,
				}),
			});
			const json = (await res.json()) as {
				success: boolean;
				error?: string;
			};
			if (!res.ok || !json.success) {
				throw new Error(json.error || "회원가입 실패");
			}
			router.push(nextPath);
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "회원가입 실패");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
			<div className="w-full max-w-md bg-white rounded-2xl border border-rose-100 shadow-sm p-8">
				<h1 className="text-2xl font-bold text-gray-800 mb-2">
					회원가입
				</h1>
				<p className="text-sm text-gray-500 mb-6">
					계정을 만들면 프로젝트가 내 계정에 안전하게 저장됩니다.
				</p>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							이름 (선택)
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
						/>
					</div>
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
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
						/>
						<p className="mt-1 text-xs text-gray-400">
							8자 이상 + 영문/숫자/특수문자 모두 포함
						</p>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							비밀번호 확인
						</label>
						<input
							type="password"
							required
							minLength={8}
							autoComplete="new-password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
						/>
						<p className="mt-1 text-xs text-gray-400">
							비밀번호를 한번 더 입력해 주세요.
						</p>
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
						{loading ? "가입 중..." : "회원가입"}
					</button>
				</form>

				<p className="text-sm text-gray-500 mt-5 text-center">
					이미 계정이 있나요?{" "}
					<Link
						href="/login"
						className="text-rose-500 hover:underline"
					>
						로그인
					</Link>
				</p>
			</div>
		</div>
	);
}
