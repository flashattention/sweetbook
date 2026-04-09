"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AuthMenuProps {
	user: {
		id: string;
		email: string;
		name: string | null;
	} | null;
}

export function AuthMenu({ user }: AuthMenuProps) {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	async function handleLogout() {
		setLoading(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
			router.refresh();
		} finally {
			setLoading(false);
		}
	}

	if (!user) {
		return (
			<div className="flex items-center gap-2">
				<Link
					href="/login"
					className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/90 px-4 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-white"
				>
					로그인
				</Link>
				<Link
					href="/signup"
					className="text-sm font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-full hover:bg-slate-800"
				>
					회원가입
				</Link>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-3">
			<p className="text-sm text-slate-700 max-w-[220px] truncate">
				{user.name || user.email}
			</p>
			<button
				onClick={handleLogout}
				disabled={loading}
				className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/90 px-4 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-white disabled:opacity-60"
			>
				{loading ? "로그아웃 중..." : "로그아웃"}
			</button>
		</div>
	);
}
