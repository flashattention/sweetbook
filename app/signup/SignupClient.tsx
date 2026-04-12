"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Step = "email" | "verify" | "info";

export default function SignupClient() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const nextPath = searchParams.get("next") || "/";

	const [step, setStep] = useState<Step>("email");

	// Step 1: email
	const [email, setEmail] = useState("");
	const [sendingCode, setSendingCode] = useState(false);

	// Step 2: verify
	const [code, setCode] = useState("");
	const [verifying, setVerifying] = useState(false);

	// Step 3: info
	const [name, setName] = useState("");
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

	async function handleSendCode() {
		setError("");
		if (!email.trim()) {
			setError("이메일을 입력해 주세요.");
			return;
		}
		setSendingCode(true);
		try {
			const res = await fetch("/api/auth/send-verification", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim() }),
			});
			const json = await res.json();
			if (!res.ok || !json.success)
				throw new Error(json.error || "발송 실패");
			// SMTP 미설정 시 인증 단계 생략하고 바로 정보 입력으로
			if (json.smtpDisabled) {
				setStep("info");
			} else {
				setStep("verify");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "발송 실패");
		} finally {
			setSendingCode(false);
		}
	}

	async function handleVerify() {
		setError("");
		if (!code.trim()) {
			setError("인증 코드를 입력해 주세요.");
			return;
		}
		setVerifying(true);
		try {
			const res = await fetch("/api/auth/verify-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: email.trim(),
					code: code.trim(),
				}),
			});
			const json = await res.json();
			if (!res.ok || !json.success)
				throw new Error(json.error || "인증 실패");
			setStep("info");
		} catch (err) {
			setError(err instanceof Error ? err.message : "인증 실패");
		} finally {
			setVerifying(false);
		}
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError("");

		if (!isStrongPassword(password)) {
			setError(
				"비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 모두 포함해야 합니다.",
			);
			return;
		}
		if (password !== confirmPassword) {
			setError("비밀번호 확인 값이 일치하지 않습니다.");
			return;
		}

		setLoading(true);
		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					email: email.trim(),
					password,
					confirmPassword,
				}),
			});
			const json = (await res.json()) as {
				success: boolean;
				error?: string;
			};
			if (!res.ok || !json.success)
				throw new Error(json.error || "회원가입 실패");
			router.push(nextPath);
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "회원가입 실패");
		} finally {
			setLoading(false);
		}
	}

	const stepLabels = ["이메일 인증", "코드 확인", "정보 입력"];
	const stepIndex = step === "email" ? 0 : step === "verify" ? 1 : 2;

	return (
		<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
			<div className="w-full max-w-md bg-zinc-900 rounded-2xl border border-white/[0.08] shadow-xl p-8">
				<Link
					href="/"
					className="text-2xl font-black text-white tracking-tight block mb-6"
				>
					Dreamcatcher
				</Link>
				<h1 className="text-xl font-bold text-white mb-1">회원가입</h1>
				<p className="text-sm text-zinc-400 mb-6">
					계정을 만들면 작품이 안전하게 저장됩니다.
				</p>

				{/* 스텝 표시 */}
				<div className="flex items-center mb-8">
					{stepLabels.map((label, i) => (
						<div
							key={label}
							className="flex items-center flex-1 last:flex-none"
						>
							<div className="flex items-center gap-1.5">
								<div
									className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < stepIndex ? "bg-violet-600 text-white" : i === stepIndex ? "bg-violet-600 text-white ring-2 ring-violet-400/40" : "bg-white/[0.06] text-zinc-500"}`}
								>
									{i < stepIndex ? "✓" : i + 1}
								</div>
								<span
									className={`text-xs ${i === stepIndex ? "text-white font-medium" : "text-zinc-500"}`}
								>
									{label}
								</span>
							</div>
							{i < 2 && (
								<div
									className={`h-px flex-1 mx-2 ${i < stepIndex ? "bg-violet-600" : "bg-white/[0.08]"}`}
								/>
							)}
						</div>
					))}
				</div>

				{error && (
					<p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 mb-4">
						{error}
					</p>
				)}

				{/* Step 1: 이메일 */}
				{step === "email" && (
					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-zinc-300 mb-1">
								이메일
							</label>
							<input
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleSendCode();
									}
								}}
								placeholder="example@email.com"
								className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
							/>
						</div>
						<button
							type="button"
							onClick={handleSendCode}
							disabled={sendingCode}
							className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
						>
							{sendingCode ? "발송 중..." : "인증코드 받기"}
						</button>
					</div>
				)}

				{/* Step 2: 코드 확인 */}
				{step === "verify" && (
					<div className="space-y-4">
						<p className="text-sm text-zinc-400">
							<span className="text-violet-400 font-medium">
								{email}
							</span>
							으로 인증 코드를 발송했습니다.
						</p>
						<div>
							<label className="block text-sm font-medium text-zinc-300 mb-1">
								인증 코드
							</label>
							<input
								type="text"
								inputMode="numeric"
								maxLength={6}
								value={code}
								onChange={(e) =>
									setCode(e.target.value.replace(/\D/g, ""))
								}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleVerify();
									}
								}}
								placeholder="6자리 코드"
								className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-center text-lg tracking-widest"
							/>
							<p className="mt-1 text-xs text-zinc-500">
								코드는 10분간 유효합니다.
							</p>
						</div>
						<button
							type="button"
							onClick={handleVerify}
							disabled={verifying || code.length !== 6}
							className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
						>
							{verifying ? "확인 중..." : "인증 확인"}
						</button>
						<button
							type="button"
							onClick={() => {
								setStep("email");
								setCode("");
								setError("");
							}}
							className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
						>
							← 이메일 다시 입력
						</button>
					</div>
				)}

				{/* Step 3: 이름/비밀번호 */}
				{step === "info" && (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="px-3 py-2 bg-violet-900/20 border border-violet-800/30 rounded-lg text-xs text-violet-300">
							✓ {email} 인증 완료
						</div>
						<div>
							<label className="block text-sm font-medium text-zinc-300 mb-1">
								이름 (선택)
							</label>
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="표시될 이름"
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
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
							/>
							<p className="mt-1 text-xs text-zinc-500">
								8자 이상 + 영문/숫자/특수문자 모두 포함
							</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-zinc-300 mb-1">
								비밀번호 확인
							</label>
							<input
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(e) =>
									setConfirmPassword(e.target.value)
								}
								className="w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
							/>
						</div>
						<button
							type="submit"
							disabled={loading}
							className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
						>
							{loading ? "가입 중..." : "가입 완료"}
						</button>
					</form>
				)}

				<p className="text-sm text-zinc-500 mt-6 text-center">
					이미 계정이 있나요?{" "}
					<Link
						href="/login"
						className="text-violet-400 hover:text-violet-300"
					>
						로그인
					</Link>
				</p>
			</div>
		</div>
	);
}
