import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
	subsets: ["latin"],
	weight: ["400", "500", "700", "900"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "Momento Book Studio",
	description:
		"포토북 제작/주문과 AI 만화·소설 자동 생성을 한 곳에서 제공하는 북 스튜디오",
	keywords: ["포토북", "AI 만화", "AI 소설", "출판", "창작"],
	openGraph: {
		title: "Momento Book Studio",
		description: "포토북부터 AI 만화·소설까지, 당신의 이야기를 책으로.",
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
			<body className={notoSansKr.className}>{children}</body>
		</html>
	);
}
