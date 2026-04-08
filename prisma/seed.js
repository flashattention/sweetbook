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
			projectType: "PHOTOBOOK",
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
			projectType: "PHOTOBOOK",
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
			projectType: "PHOTOBOOK",
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

	// ─────────────────────────────────────────────────────────
	// 프로젝트 4: AI 만화 샘플 — 커플 연애 스토리
	// ─────────────────────────────────────────────────────────
	await prisma.project.create({
		data: {
			title: "벚꽃 아래, 우리",
			coupleNameA: "유진",
			coupleNameB: "도윤",
			anniversaryDate: new Date("2025-04-10"),
			projectType: "COMIC",
			comicStyle: "MANGA",
			genre: "로맨스",
			synopsis:
				"대학 캠퍼스에서 우연히 만난 두 사람이 사계절을 지나며 서로의 상처를 이해하고 연인이 되어가는 이야기.",
			status: "PUBLISHED",
			coverImageUrl:
				"https://picsum.photos/seed/comic-love-cover/900/700",
			coverCaption: "사계절 끝에서 다시 만난 마음",
			pages: {
				create: [
					{
						pageOrder: 1,
						imageUrl:
							"https://picsum.photos/seed/comic-love-1/900/700",
						caption:
							"벚꽃이 흩날리던 입학식 날, 유진과 도윤이 처음 마주친다.",
					},
					{
						pageOrder: 2,
						imageUrl:
							"https://picsum.photos/seed/comic-love-2/900/700",
						caption:
							"비 오는 날 우산 하나를 함께 쓰며 두 사람의 거리가 가까워진다.",
					},
					{
						pageOrder: 3,
						imageUrl:
							"https://picsum.photos/seed/comic-love-3/900/700",
						caption:
							"작은 오해로 멀어지지만, 서로의 진심을 확인하며 다시 손을 잡는다.",
					},
					{
						pageOrder: 4,
						imageUrl:
							"https://picsum.photos/seed/comic-love-4/900/700",
						caption:
							"첫눈이 내리는 밤, 두 사람은 다시 시작을 약속한다.",
					},
				],
			},
		},
	});

	// ─────────────────────────────────────────────────────────
	// 프로젝트 5: AI 만화 샘플 — 한국 소년의 일대기
	// ─────────────────────────────────────────────────────────
	await prisma.project.create({
		data: {
			title: "한강의 소년, 세계를 걷다",
			coupleNameA: "서진",
			coupleNameB: "할머니",
			anniversaryDate: new Date("2025-01-01"),
			projectType: "COMIC",
			comicStyle: "AMERICAN",
			genre: "성장 드라마",
			synopsis:
				"서울 변두리에서 자란 소년 서진이 가족과 스승의 도움으로 좌절을 넘어 자신의 꿈을 찾아가는 여정.",
			status: "PUBLISHED",
			coverImageUrl: "https://picsum.photos/seed/comic-boy-cover/900/700",
			coverCaption: "작은 골목에서 시작된 큰 발걸음",
			pages: {
				create: [
					{
						pageOrder: 1,
						imageUrl:
							"https://picsum.photos/seed/comic-boy-1/900/700",
						caption:
							"한강 근처 오래된 동네에서, 소년 서진의 하루가 시작된다.",
					},
					{
						pageOrder: 2,
						imageUrl:
							"https://picsum.photos/seed/comic-boy-2/900/700",
						caption:
							"학교에서 좌절을 겪지만, 미술 선생님의 격려로 다시 펜을 든다.",
					},
					{
						pageOrder: 3,
						imageUrl:
							"https://picsum.photos/seed/comic-boy-3/900/700",
						caption:
							"지역 공모전에서 처음 수상하며 스스로를 믿기 시작한다.",
					},
					{
						pageOrder: 4,
						imageUrl:
							"https://picsum.photos/seed/comic-boy-4/900/700",
						caption:
							"성인이 된 서진은 자신의 작품으로 또 다른 아이들에게 꿈을 전한다.",
					},
				],
			},
		},
	});

	console.log("✅ 시드 완료: 5개의 프로젝트가 생성되었습니다.");
}

main()
	.catch((e) => {
		console.error("❌ 시드 실패:", e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
