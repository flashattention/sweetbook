import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Momento — 연인을 위한 기념일 포토북",
	description:
		"함께한 사진과 추억을 담아 특별한 포토북으로. 연인을 위한 기념일 선물.",
	keywords: ["포토북", "기념일", "연인", "커플", "추억", "인쇄"],
	openGraph: {
		title: "Momento",
		description: "사랑의 순간을, 영원히 간직하세요.",
		type: "website",
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ko">
			<body>{children}</body>
		</html>
	);
}
