"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Profile = {
	id: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	createdAt: string;
};

export default function ProfileClient() {
	const router = useRouter();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState(true);

	// 프로필 편집
	const [name, setName] = useState("");
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileMsg, setProfileMsg] = useState<{
		type: "ok" | "err";
		text: string;
	} | null>(null);

	// 아바타
	const [uploadingAvatar, setUploadingAvatar] = useState(false);
	const [avatarMsg, setAvatarMsg] = useState<{
		type: "ok" | "err";
		text: string;
	} | null>(null);

	// 비밀번호 변경
	const [oldPassword, setOldPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [savingPw, setSavingPw] = useState(false);
	const [pwMsg, setPwMsg] = useState<{
		type: "ok" | "err";
		text: string;
	} | null>(null);

	useEffect(() => {
		fetch("/api/auth/profile")
			.then((r) => r.json())
			.then((d) => {
				if (d.success && d.data) {
					setProfile(d.data);
					setName(d.data.name || "");
				} else {
					router.push("/login?next=/profile");
				}
			})
			.catch(() => router.push("/login?next=/profile"))
			.finally(() => setLoading(false));
	}, [router]);

	async function handleSaveProfile(e: React.FormEvent) {
		e.preventDefault();
		setSavingProfile(true);
		setProfileMsg(null);
		try {
			const res = await fetch("/api/auth/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			const json = await res.json();
			if (!res.ok || !json.success)
				throw new Error(json.error || "저장 실패");
			setProfile((p) => (p ? { ...p, name: json.data.name } : p));
			setProfileMsg({ type: "ok", text: "프로필이 저장됐습니다." });
			router.refresh();
		} catch (err) {
			setProfileMsg({
				type: "err",
				text: err instanceof Error ? err.message : "저장 실패",
			});
		} finally {
			setSavingProfile(false);
		}
	}

	async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setUploadingAvatar(true);
		setAvatarMsg(null);
		try {
			const formData = new FormData();
			formData.append("file", file);
			const res = await fetch("/api/auth/avatar", {
				method: "POST",
				body: formData,
			});
			const json = await res.json();
			if (!res.ok || !json.success)
				throw new Error(json.error || "업로드 실패");
			setProfile((p) =>
				p ? { ...p, avatarUrl: json.data.avatarUrl } : p,
			);
			setAvatarMsg({ type: "ok", text: "프로필 이미지가 변경됐습니다." });
		} catch (err) {
			setAvatarMsg({
				type: "err",
				text: err instanceof Error ? err.message : "업로드 실패",
			});
		} finally {
			setUploadingAvatar(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	async function handleChangePassword(e: React.FormEvent) {
		e.preventDefault();
		setSavingPw(true);
		setPwMsg(null);
		try {
			const res = await fetch("/api/auth/change-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					oldPassword,
					newPassword,
					confirmPassword,
				}),
			});
			const json = await res.json();
			if (!res.ok || !json.success)
				throw new Error(json.error || "변경 실패");
			setPwMsg({ type: "ok", text: "비밀번호가 변경됐습니다." });
			setOldPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (err) {
			setPwMsg({
				type: "err",
				text: err instanceof Error ? err.message : "변경 실패",
			});
		} finally {
			setSavingPw(false);
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-zinc-950 flex items-center justify-center">
				<div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	if (!profile) return null;

	const inputClass =
		"w-full bg-zinc-800 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50";
	const labelClass = "block text-sm font-medium text-zinc-300 mb-1";

	return (
		<div className="min-h-screen bg-zinc-950">
			{/* 헤더 */}
			<header className="sticky top-0 z-40 bg-zinc-950 border-b border-white/[0.08]">
				<div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
					<Link
						href="/"
						className="text-zinc-400 hover:text-white text-sm transition-colors"
					>
						← 홈
					</Link>
					<h1 className="text-base font-bold text-white">
						마이페이지
					</h1>
				</div>
			</header>

			<main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
				{/* ── 프로필 이미지 ── */}
				<section className="bg-zinc-900 rounded-2xl border border-white/[0.08] p-6">
					<h2 className="text-base font-bold text-white mb-5">
						프로필 이미지
					</h2>
					<div className="flex items-center gap-5">
						<div
							className="w-20 h-20 rounded-full overflow-hidden bg-violet-800 flex items-center justify-center flex-shrink-0 cursor-pointer ring-2 ring-white/10 hover:ring-violet-500/50 transition-all"
							onClick={() => fileInputRef.current?.click()}
						>
							{profile.avatarUrl ? (
								<Image
									src={profile.avatarUrl}
									alt="프로필"
									width={80}
									height={80}
									className="object-cover w-full h-full"
									unoptimized
								/>
							) : (
								<span className="text-white text-2xl font-bold">
									{(profile.name ||
										profile.email)[0].toUpperCase()}
								</span>
							)}
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm text-zinc-400 mb-3">
								JPG, PNG, WebP, GIF · 최대 5MB
							</p>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								disabled={uploadingAvatar}
								className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
							>
								{uploadingAvatar
									? "업로드 중..."
									: "이미지 변경"}
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								className="hidden"
								onChange={handleAvatarChange}
							/>
						</div>
					</div>
					{avatarMsg && (
						<p
							className={`mt-3 text-sm px-3 py-2 rounded-lg ${avatarMsg.type === "ok" ? "text-green-300 bg-green-900/20 border border-green-800/30" : "text-red-400 bg-red-900/20 border border-red-800/30"}`}
						>
							{avatarMsg.text}
						</p>
					)}
				</section>

				{/* ── 프로필 정보 ── */}
				<section className="bg-zinc-900 rounded-2xl border border-white/[0.08] p-6">
					<h2 className="text-base font-bold text-white mb-5">
						프로필 정보
					</h2>
					<form onSubmit={handleSaveProfile} className="space-y-4">
						<div>
							<label className={labelClass}>
								이메일 (변경 불가)
							</label>
							<input
								type="text"
								value={profile.email}
								disabled
								className="w-full bg-zinc-800/50 border border-white/[0.05] rounded-lg px-3 py-2.5 text-sm text-zinc-500 cursor-not-allowed"
							/>
						</div>
						<div>
							<label className={labelClass}>닉네임</label>
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={50}
								placeholder="표시될 이름"
								className={inputClass}
							/>
						</div>
						{profileMsg && (
							<p
								className={`text-sm px-3 py-2 rounded-lg ${profileMsg.type === "ok" ? "text-green-300 bg-green-900/20 border border-green-800/30" : "text-red-400 bg-red-900/20 border border-red-800/30"}`}
							>
								{profileMsg.text}
							</p>
						)}
						<button
							type="submit"
							disabled={savingProfile}
							className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
						>
							{savingProfile ? "저장 중..." : "저장"}
						</button>
					</form>
				</section>

				{/* ── 비밀번호 변경 ── */}
				<section className="bg-zinc-900 rounded-2xl border border-white/[0.08] p-6">
					<h2 className="text-base font-bold text-white mb-5">
						비밀번호 변경
					</h2>
					<form onSubmit={handleChangePassword} className="space-y-4">
						<div>
							<label className={labelClass}>현재 비밀번호</label>
							<input
								type="password"
								value={oldPassword}
								onChange={(e) => setOldPassword(e.target.value)}
								autoComplete="current-password"
								className={inputClass}
							/>
						</div>
						<div>
							<label className={labelClass}>새 비밀번호</label>
							<input
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								autoComplete="new-password"
								className={inputClass}
							/>
							<p className="mt-1 text-xs text-zinc-500">
								8자 이상 + 영문/숫자/특수문자 모두 포함
							</p>
						</div>
						<div>
							<label className={labelClass}>
								새 비밀번호 확인
							</label>
							<input
								type="password"
								value={confirmPassword}
								onChange={(e) =>
									setConfirmPassword(e.target.value)
								}
								autoComplete="new-password"
								className={inputClass}
							/>
						</div>
						{pwMsg && (
							<p
								className={`text-sm px-3 py-2 rounded-lg ${pwMsg.type === "ok" ? "text-green-300 bg-green-900/20 border border-green-800/30" : "text-red-400 bg-red-900/20 border border-red-800/30"}`}
							>
								{pwMsg.text}
							</p>
						)}
						<button
							type="submit"
							disabled={savingPw}
							className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
						>
							{savingPw ? "변경 중..." : "비밀번호 변경"}
						</button>
					</form>
				</section>

				{/* 가입일 */}
				<p className="text-center text-xs text-zinc-600">
					가입일:{" "}
					{new Date(profile.createdAt).toLocaleDateString("ko-KR")}
				</p>
			</main>
		</div>
	);
}
