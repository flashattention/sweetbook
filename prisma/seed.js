/**
 * Prisma Seed — Momento 더미 데이터
 *
 * 실행: node prisma/seed.js  또는  npx prisma db seed
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
	// 기존 데이터 초기화
	await prisma.page.deleteMany();
	await prisma.project.deleteMany();

	// ─────────────────────────────────────────────────────────
	// 프로젝트 1: 편집 중인 초안 (DRAFT)
	// ─────────────────────────────────────────────────────────
	await prisma.project.create({
		data: {
			title: "우리의 첫 번째 이야기",
			coupleNameA: "지은",
			coupleNameB: "민준",
			anniversaryDate: new Date("2025-03-14"),
			status: "DRAFT",
			coverImageUrl: "https://picsum.photos/seed/cover-momento1/800/600",
			coverCaption: "사랑은 매일 선택하는 것",
			pages: {
				create: [
					{
						pageOrder: 1,
						imageUrl:
							"https://picsum.photos/seed/momento-p1/800/600",
						caption:
							"처음 만난 날, 봄바람이 불었다. 그 날의 설렘이 아직도 생생하다.",
					},
					{
						pageOrder: 2,
						imageUrl:
							"https://picsum.photos/seed/momento-p2/800/600",
						caption:
							"제주도에서의 3일, 잊을 수 없는 기억들로 가득 찬 시간.",
					},
					{
						pageOrder: 3,
						imageUrl:
							"https://picsum.photos/seed/momento-p3/800/600",
						caption:
							"첫 번째 기념일, 작은 카페에서 나눈 달콤한 케이크.",
					},
					{
						pageOrder: 4,
						imageUrl:
							"https://picsum.photos/seed/momento-p4/800/600",
						caption: "함께 걷는 모든 길이 행복하다.",
					},
				],
			},
		},
	});

	// ─────────────────────────────────────────────────────────
	// 프로젝트 2: 주문 완료 상태 (ORDERED) — 배송 현황 화면 체험용
	// ─────────────────────────────────────────────────────────
	await prisma.project.create({
		data: {
			title: "100일의 기적",
			coupleNameA: "소연",
			coupleNameB: "태준",
			anniversaryDate: new Date("2025-08-01"),
			status: "ORDERED",
			bookUid: "demo-book-001",
			orderUid: "demo-order-001",
			orderStatus: "PROCESSING",
			coverImageUrl: "https://picsum.photos/seed/cover-momento2/800/600",
			coverCaption: "100일이 지나도 여전히 설레",
			pages: {
				create: [
					{
						pageOrder: 1,
						imageUrl:
							"https://picsum.photos/seed/momento2-p1/800/600",
						caption: "운명처럼 만난 우리의 첫 날.",
					},
					{
						pageOrder: 2,
						imageUrl:
							"https://picsum.photos/seed/momento2-p2/800/600",
						caption: "함께라면 어디든 특별해진다.",
					},
					{
						pageOrder: 3,
						imageUrl:
							"https://picsum.photos/seed/momento2-p3/800/600",
						caption: "100일을 함께한 소중한 우리.",
					},
				],
			},
		},
	});

	// ─────────────────────────────────────────────────────────
	// 프로젝트 3: 출판 완료 (PUBLISHED) — 주문 페이지 진행 가능
	// ─────────────────────────────────────────────────────────
	await prisma.project.create({
		data: {
			title: "여름, 그리고 너",
			coupleNameA: "하린",
			coupleNameB: "준호",
			anniversaryDate: new Date("2024-07-07"),
			status: "PUBLISHED",
			bookUid: "demo-book-002",
			coverImageUrl: "https://picsum.photos/seed/cover-momento3/800/600",
			coverCaption: "이 여름이 영원하길",
			pages: {
				create: [
					{
						pageOrder: 1,
						imageUrl:
							"https://picsum.photos/seed/momento3-p1/800/600",
						caption: "칠월의 첫날, 우리가 다시 만났다.",
					},
					{
						pageOrder: 2,
						imageUrl:
							"https://picsum.photos/seed/momento3-p2/800/600",
						caption: "해변에서의 일몰, 영원히 기억할게.",
					},
				],
			},
		},
	});

	console.log("✅ 시드 완료: 3개의 프로젝트가 생성되었습니다.");
}

main()
	.catch((e) => {
		console.error("❌ 시드 실패:", e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
