import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
	buildSessionCookieOptions,
	createSessionToken,
	getPasswordPolicyMessage,
	hashPassword,
	isStrongEnoughPassword,
} from "@/lib/auth";
import { getSweetbookClient, isSweetbookConfigured } from "@/lib/sweetbook-api";

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const DEFAULT_SAMPLE_OWNER_EMAIL =
	process.env.SAMPLE_PROJECT_OWNER_EMAIL || "a@a.a";
const DEFAULT_SAMPLE_OWNER_NAME =
	process.env.SAMPLE_PROJECT_OWNER_NAME || "테스트1";
const DEFAULT_SAMPLE_PROJECT_COUNT = 3;

type SignupSampleProjectSeed = {
	title: string;
	coverImageUrl: string;
	coverCaption: string;
	pages: Array<{ imageUrl: string; caption: string }>;
};

const SIGNUP_FALLBACK_SAMPLE_PROJECTS: SignupSampleProjectSeed[] = [
	{
		title: "오늘의 가족앨범",
		coverImageUrl:
			"https://picsum.photos/seed/signup-sample-cover-1/900/700",
		coverCaption: "우리 가족의 평범하지만 빛나는 하루",
		pages: [
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-1-1/900/700",
				caption: "주말 아침, 함께 준비한 브런치",
			},
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-1-2/900/700",
				caption: "공원 산책 중 포착한 웃음",
			},
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-1-3/900/700",
				caption: "해질녘, 집으로 돌아오는 길",
			},
		],
	},
	{
		title: "벚꽃 여행 기록",
		coverImageUrl:
			"https://picsum.photos/seed/signup-sample-cover-2/900/700",
		coverCaption: "짧았지만 선명했던 봄 여행",
		pages: [
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-2-1/900/700",
				caption: "기차 창밖으로 보이던 분홍빛 풍경",
			},
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-2-2/900/700",
				caption: "골목 카페에서 마신 따뜻한 라떼",
			},
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-2-3/900/700",
				caption: "벚꽃길 아래서 남긴 기념 사진",
			},
		],
	},
	{
		title: "작은 일상의 모음집",
		coverImageUrl:
			"https://picsum.photos/seed/signup-sample-cover-3/900/700",
		coverCaption: "소소한 순간이 모여 특별해지는 이야기",
		pages: [
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-3-1/900/700",
				caption: "비 오는 날 창가에서 읽은 책",
			},
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-3-2/900/700",
				caption: "저녁 식탁 위 따뜻한 한 끼",
			},
			{
				imageUrl:
					"https://picsum.photos/seed/signup-sample-3-3/900/700",
				caption: "하루 끝, 노을빛 하늘",
			},
		],
	},
];

async function cloneDefaultSampleProjectsForUser(
	userId: string,
): Promise<boolean> {
	const owner = await prisma.user.findFirst({
		where: {
			OR: [
				{ email: DEFAULT_SAMPLE_OWNER_EMAIL },
				{ name: DEFAULT_SAMPLE_OWNER_NAME },
			],
		},
		select: { id: true },
	});

	if (!owner || owner.id === userId) {
		return false;
	}

	const sampleProjects = await prisma.project.findMany({
		where: { userId: owner.id },
		include: { pages: { orderBy: { pageOrder: "asc" } } },
		orderBy: { updatedAt: "desc" },
		take: DEFAULT_SAMPLE_PROJECT_COUNT,
	});

	if (sampleProjects.length === 0) {
		return false;
	}

	for (const sample of sampleProjects) {
		await prisma.project.create({
			data: {
				userId,
				title: sample.title,
				storyCharacters: sample.storyCharacters,
				requestedPageCount: sample.requestedPageCount,
				generationStage: sample.generationStage,
				generationProgress: sample.generationProgress,
				generationError: sample.generationError,
				generationCostUsd: sample.generationCostUsd,
				projectType: sample.projectType,
				genre: sample.genre,
				synopsis: sample.synopsis,
				comicStyle: sample.comicStyle,
				bookSpecUid: sample.bookSpecUid,
				coverTemplateUid: sample.coverTemplateUid,
				contentTemplateUid: sample.contentTemplateUid,
				coverTemplateOverrides: sample.coverTemplateOverrides,
				contentTemplateOverrides: sample.contentTemplateOverrides,
				coverImageUrl: sample.coverImageUrl,
				coverCaption: sample.coverCaption,
				bookUid: sample.bookUid,
				orderUid: null,
				orderStatus: null,
				trackingInfo: null,
				status: sample.bookUid ? "PUBLISHED" : "DRAFT",
				pages: {
					create: sample.pages.map((page) => ({
						pageOrder: page.pageOrder,
						imageUrl: page.imageUrl,
						caption: page.caption,
						contentTemplateUid: page.contentTemplateUid,
						contentTemplateOverrides: page.contentTemplateOverrides,
					})),
				},
			},
		});
	}

	return true;
}

async function createFallbackSampleProjectsForUser(userId: string) {
	const useRealBookUid = isSweetbookConfigured();
	const client = useRealBookUid ? getSweetbookClient() : null;

	for (
		let index = 0;
		index < SIGNUP_FALLBACK_SAMPLE_PROJECTS.length;
		index += 1
	) {
		const sample = SIGNUP_FALLBACK_SAMPLE_PROJECTS[index];
		let bookUid: string | null =
			`demo-book-signup-${Date.now()}-${index + 1}`;

		if (client) {
			try {
				const createdBook = (await client.books.create({
					bookSpecUid: "SQUAREBOOK_HC",
					title: sample.title,
					creationType: "NORMAL",
				})) as { bookUid?: string };
				bookUid = createdBook.bookUid || null;
			} catch (bookCreateError) {
				console.error(
					"[POST /api/auth/signup] fallback sample book create failed",
					bookCreateError,
				);
				bookUid = null;
			}
		}

		await prisma.project.create({
			data: {
				userId,
				title: sample.title,
				projectType: "PHOTOBOOK",
				bookSpecUid: "SQUAREBOOK_HC",
				coverImageUrl: sample.coverImageUrl,
				coverCaption: sample.coverCaption,
				bookUid,
				status: bookUid ? "PUBLISHED" : "DRAFT",
				pages: {
					create: sample.pages.map((page, pageIndex) => ({
						pageOrder: pageIndex + 1,
						imageUrl: page.imageUrl,
						caption: page.caption,
					})),
				},
			},
		});
	}
}

// POST /api/auth/signup
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as {
			email?: string;
			password?: string;
			confirmPassword?: string;
			name?: string;
		};

		const email = normalizeEmail(String(body.email || ""));
		const password = String(body.password || "");
		const confirmPassword = String(body.confirmPassword || "");
		const name = typeof body.name === "string" ? body.name.trim() : "";

		if (!isValidEmail(email)) {
			return NextResponse.json(
				{ success: false, error: "유효한 이메일을 입력해 주세요." },
				{ status: 400 },
			);
		}
		if (!isStrongEnoughPassword(password)) {
			return NextResponse.json(
				{ success: false, error: getPasswordPolicyMessage() },
				{ status: 400 },
			);
		}
		if (password !== confirmPassword) {
			return NextResponse.json(
				{
					success: false,
					error: "비밀번호 확인 값이 일치하지 않습니다.",
				},
				{ status: 400 },
			);
		}

		const exists = await prisma.user.findUnique({ where: { email } });
		if (exists) {
			return NextResponse.json(
				{ success: false, error: "이미 가입된 이메일입니다." },
				{ status: 409 },
			);
		}

		const passwordHash = await hashPassword(password);
		const user = await prisma.user.create({
			data: {
				email,
				passwordHash,
				name: name || null,
			},
			select: { id: true, email: true, name: true },
		});

		try {
			const cloned = await cloneDefaultSampleProjectsForUser(user.id);
			if (!cloned) {
				await createFallbackSampleProjectsForUser(user.id);
			}
		} catch (sampleCloneError) {
			console.error(
				"[POST /api/auth/signup] sample project clone failed",
				sampleCloneError,
			);
		}

		const token = createSessionToken(user.id);
		const response = NextResponse.json({ success: true, data: user });
		response.cookies.set("sb_session", token, buildSessionCookieOptions());
		return response;
	} catch (err) {
		console.error("[POST /api/auth/signup]", err);
		return NextResponse.json(
			{ success: false, error: "회원가입 중 오류가 발생했습니다." },
			{ status: 500 },
		);
	}
}
