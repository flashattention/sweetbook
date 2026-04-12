import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export const metadata = { title: "마이페이지 | Dreamcatcher" };

export default function ProfilePage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
			<ProfileClient />
		</Suspense>
	);
}
