# Dreamcatcher — AI 만화·소설 창작 플랫폼

**실서비스 URL:** https://dreamcatcher-iota.vercel.app/

> 시놉시스 한 편으로 AI가 만화와 소설을 자동 생성하고, 창작물을 커뮤니티에 공유하거나 실제 책으로 주문할 수 있는 웹 애플리케이션입니다.

## 목차

1. [서비스 소개](#1-서비스-소개)
2. [사전 준비](#2-사전-준비)
3. [빠른 시작](#3-빠른-시작)
4. [환경 변수](#4-환경-변수)
5. [기본 샘플 프로젝트](#5-기본-샘플-프로젝트)
6. [테스트 계정](#6-테스트-계정)
7. [주요 사용자 흐름](#7-주요-사용자-흐름)
8. [스크립트 레퍼런스](#8-스크립트-레퍼런스)
9. [프로젝트 구조](#9-프로젝트-구조)
10. [기술 스택](#10-기술-스택)
11. [Book Print API 사용 목록](#11-book-print-api-사용-목록)
12. [사용 AI 모델](#12-사용-ai-모델)
13. [설계 의도](#13-설계-의도)
14. [보안 유의사항](#14-보안-유의사항)

---

## 1. 서비스 소개

### 한 문장 요약

장르·캐릭터·시놉시스를 입력하면 AI가 만화 또는 소설을 자동 생성하고, 커뮤니티에서 창작물을 공유하며 실물 책으로 주문까지 이어지는 end-to-end 창작 플랫폼입니다.

### 타겟 고객

- 간단한 아이디어로 AI 만화책·소설을 만들고 싶은 1인 창작자
- 자신의 창작물을 커뮤니티에 공유하고 다른 사람의 작품과 소통하고 싶은 사용자
- 완성된 AI 창작물을 실물 책으로 보유하거나 선물하고 싶은 사용자

### 주요 기능

- **AI 만화 생성**: 시놉시스·장르 입력 → 페이지별 이미지+캡션 자동 생성 (4종 스토리 모델 / 5종 이미지 모델 선택)
- **AI 소설 생성**: 시놉시스·장르 입력 → 챕터·페이지 본문 자동 생성 (24페이지 기준)
- **생성 자동 재개**: 서버 재시작·timeout 발생 시 5분 무변화 감지 후 자동으로 이어서 생성 재개 (이미 완성된 페이지는 보존)
- **캐릭터 참조 이미지**: `gpt-image-1` 계열 모델 선택 시 캐릭터 사진+이름을 등록해 일관된 외모로 이미지 생성
- **커뮤니티**: 게시글·댓글·좋아요 기반 창작물 공유 게시판
- **크레딧 시스템**: AI 생성 비용이 크레딧으로 차감되며, 마이페이지에서 4종 패키지(100·500·1000·3000 크레딧)로 충전 가능
- **마이페이지**: 프로필 사진 업로드, 닉네임·비밀번호 변경, 크레딧 잔액 확인
- **이메일 인증 회원가입**: 3단계 흐름 (이메일 → 인증코드 → 정보 입력), SMTP 미설정 시 자동 우회
- **계정 기반 데이터 분리**: 로그인·세션 인증 (scrypt + HttpOnly 쿠키)
- **기본 샘플 프로젝트**: 테스트 계정(`a@a.a`)에 완성된 샘플 프로젝트 2종(만화·소설) 포함 — 신규 가입 계정에는 표시되지 않음
- **출판·주문** *(선택)*: Sweetbook Book Print API 연동 시 AI 창작물을 실물 책으로 주문 가능

---

## 2. 사전 준비

| 항목 | 요구사항 |
|---|---|
| Node.js | **≥ 18.0.0** |
| npm | ≥ 9.0.0 (Node 18+ 기본 포함) |
| Supabase 프로젝트 | PostgreSQL DB + Storage 버킷(uploads) 필요 |
| OpenAI API Key | AI 만화·소설 생성 기능에 필요 |
| Sweetbook API Key | 출판·주문 기능에만 필요 *(선택)* |

> **OpenAI Key 없이도** 샘플 프로젝트 조회, 커뮤니티, 에디터 UI 탐색 등 대부분의 화면을 확인할 수 있습니다.

---

## 3. 빠른 시작

```bash
# 1. 저장소 클론
git clone https://github.com/flashattention/sweetbook.git
cd sweetbook

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env
# .env를 열어 Supabase, API 키 등을 입력합니다 (아래 [환경 변수] 섹션 참고)

# 4. DB 스키마 동기화 (Supabase PostgreSQL)
npx prisma db push

# 5. 샘플 데이터 삽입
node prisma/seed.js

# 6. 개발 서버 실행
npm run dev
```

브라우저에서 확인: **http://localhost:3000**

> DB는 **Supabase PostgreSQL**을 사용합니다. `.env`에 `DATABASE_URL`과 `DIRECT_URL`을 설정해야 합니다.  
> `node prisma/seed.js`가 샘플 프로젝트 3개를 삽입합니다.

---

## 4. 환경 변수

`.env.example`을 복사해 `.env`에 실제 값을 입력하세요.

```env
# ── 필수 ──────────────────────────────────────────────────────────────────
AUTH_SECRET=replace_with_random_secret_min_32_chars   # 세션 서명 키 (필수)

# ── Supabase ───────────────────────────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# ── Database (Supabase PostgreSQL) ─────────────────────────────────────────
# Transaction pooler (port 6543) — 앱 런타임용
DATABASE_URL="postgresql://postgres.xxxx:password@aws-x-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
# Session pooler (port 5432) — prisma migrate/db push 용
DIRECT_URL="postgresql://postgres.xxxx:password@aws-x-ap-northeast-1.pooler.supabase.com:5432/postgres"

# ── OpenAI (AI 만화·소설 생성) ─────────────────────────────────────────────
OPENAI_API_KEY=your_openai_api_key

# ── 크레딧 충전 관리자 암호 ────────────────────────────────────────────────
# 미설정 시 기본값 "Test1234!" 사용. 프로덕션에서는 반드시 변경하세요.
ADMIN_CHARGE_PASSWORD=your_admin_password

# ── Sweetbook Book Print API (출판·주문 기능에만 필요 — 선택) ──────────────
SWEETBOOK_API_KEY=SB_YOUR_API_KEY
SWEETBOOK_ENV=sandbox                  # sandbox | production
SWEETBOOK_WEBHOOK_SECRET=your_secret   # 웹훅 서명 검증용

# ── 기본 템플릿 (선택 — 없으면 프로젝트 설정값 사용) ───────────────────────
SWEETBOOK_COVER_TEMPLATE_UID=39kySqmyRhhs
SWEETBOOK_CONTENT_TEMPLATE_UID=46VqZhVNOfAp

# ── 이메일 인증 (선택 — 미설정 시 인증 단계 자동 우회) ────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Dreamcatcher <your@gmail.com>"

# ── 선택 항목 ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
APP_BASE_URL=https://your-app.vercel.app
```

| 변수 | 필수 여부 | 설명 |
|---|---|---|
| `AUTH_SECRET` | **필수** | 세션 쿠키 서명용. 최소 32자 임의 문자열 (`openssl rand -base64 32`) |
| `SUPABASE_URL` | **필수** | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **필수** | Supabase Storage 업로드용 서버 키 |
| `DATABASE_URL` | **필수** | Supabase Transaction Pooler URL (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | **필수** | Supabase Session Pooler URL (port 5432, `prisma db push` 전용) |
| `OPENAI_API_KEY` | AI 기능 시 필수 | AI 만화·소설 생성에 필요 |
| `ADMIN_CHARGE_PASSWORD` | 권장 | 크레딧 무료 충전용 관리자 암호. 미설정 시 `Test1234!` 사용 (프로덕션에서는 반드시 설정) |
| `SWEETBOOK_API_KEY` | 출판·주문 시 필수 | 없으면 출판/주문 단계에서 오류 발생 |
| `SWEETBOOK_ENV` | 권장 | `sandbox` 또는 `production` |
| `SWEETBOOK_WEBHOOK_SECRET` | 권장 | 웹훅 이벤트 서명 검증 |
| `SWEETBOOK_COVER_TEMPLATE_UID` | 선택 | 폴백 표지 템플릿 UID (프로젝트 설정값 우선) |
| `SWEETBOOK_CONTENT_TEMPLATE_UID` | 선택 | 폴백 내지 템플릿 UID (프로젝트 설정값 우선) |
| `SMTP_HOST` | 선택 | 이메일 인증용 SMTP 서버 (미설정 시 인증 단계 건너뜀) |
| `SMTP_PORT` | 선택 | SMTP 포트 (기본 587) |
| `SMTP_USER` | 선택 | SMTP 계정 이메일 |
| `SMTP_PASS` | 선택 | SMTP 앱 비밀번호 |
| `SMTP_FROM` | 선택 | 발신자 표시 이름 및 이메일 |
| `NEXT_PUBLIC_APP_URL` | 선택 | 이미지 URL 절대 경로 해상용 |
| `APP_BASE_URL` | 선택 | 서버 사이드에서 상대 이미지 경로 해석 시 사용 (미설정 시 NEXT_PUBLIC_APP_URL 폴백) |

---

## 5. 기본 샘플 프로젝트

`node prisma/seed.js` 실행 시 **테스트 계정(`a@a.a`)** 소유로 완성된 샘플 프로젝트 2종이 생성됩니다.

| 제목 | 유형 | 내용 |
|---|---|---|
| 슈퍼파워 고양이 | AI 만화 (판타지, AMERICAN 스타일, 24컷) | AI가 생성한 이미지·캡션으로 완성된 만화 |
| 선생님의 안경 | AI 소설 (미스테리, 24페이지) | AI가 생성한 본문으로 완성된 소설 |

### 동작 방식

샘플 프로젝트는 테스트 계정(`a@a.a`)에 귀속됩니다. 동작 규칙은 다음과 같습니다.

- **신규 가입 계정에서는 샘플이 표시되지 않습니다.** 테스트 계정으로 로그인해야 샘플을 볼 수 있습니다.
- 샘플 프로젝트는 일반 프로젝트와 동일하게 삭제·편집 가능합니다.
- `npm run db:reset` 또는 `npm run db:setup` 실행 시 테스트 계정과 샘플 프로젝트가 항상 재생성됩니다.

### 이미지 파일

샘플 프로젝트의 이미지 파일은 **Supabase Storage** `uploads` 버킷에 저장됩니다. 새 환경에서 시드를 실행한 후 `node scripts/migrate-uploads.js`로 이미지를 마이그레이션하거나, `public/uploads/`의 파일을 직접 Supabase Storage에 업로드해야 합니다.

> **참고**: Supabase Storage 설정 전에는 샘플 이미지가 표시되지 않을 수 있습니다.

---

## 6. 테스트 계정

저장소 클론 후 `npm run db:setup` 또는 `npm run db:reset` 실행 이후 사용 가능합니다.

| 이메일 | 비밀번호 |
|---|---|
| `a@a.a` | `Test1234!` |

로그인하면 홈 화면에서 샘플 프로젝트를 즉시 확인할 수 있습니다.  
**신규로 회원가입한 계정**에서도 동일하게 샘플이 표시됩니다.

---

## 7. 주요 사용자 흐름

### 7-1. 샘플 프로젝트 체험

1. `npm run dev` 실행
2. `http://localhost:3000/login`에서 테스트 계정(`a@a.a` / `Test1234!`) 로그인
3. 홈 화면에서 샘플 프로젝트(**슈퍼파워 고양이**, **선생님의 안경**) 확인
4. **슈퍼파워 고양이** 클릭 → 만화 페이지 뷰어 확인

### 7-2. AI 만화 신규 생성 (`OPENAI_API_KEY` 필요)

1. 홈 화면에서 **+ 만들기** 클릭
2. **AI 만화** 선택
3. 장르·캐릭터·시놉시스 입력
4. 스토리 모델(`gpt-4o-mini` ~ `gpt-4.1`) 및 이미지 모델(`dall-e-2` ~ `gpt-image-1-hd`) 선택
5. *(gpt-image-1 계열 선택 시)* 캐릭터 이름과 참조 사진 등록 (최대 5명)
6. **생성 시작** → 진행 화면(`/create/progress/[id]`)에서 실시간 생성 상태 확인
7. 생성 완료 후 에디터에서 수정 → 출판 → 주문 *(출판·주문은 `SWEETBOOK_API_KEY` 필요)*

> **생성 중 중단 시**: 서버 재시작·timeout이 발생해도 progress 화면이 5분간 변화가 없으면 자동으로 생성을 재개합니다. 이미 완성된 페이지는 DB에 실시간 저장되므로 처음부터 다시 생성하지 않습니다.

### 7-3. AI 소설 신규 생성 (`OPENAI_API_KEY` 필요)

1. 홈 화면에서 **+ 만들기** 클릭
2. **AI 소설** 선택
3. 장르·시놉시스 입력, 스토리 모델 선택
4. **생성 시작** → 진행 화면에서 페이지별 집필 현황 확인
5. 생성 완료 후 에디터에서 수정 → 출판 → 주문 *(출판·주문은 `SWEETBOOK_API_KEY` 필요)*

> 소설도 페이지가 완성될 때마다 즉시 DB에 저장되므로, 중단 후 재개 시 이어서 생성됩니다.

### 7-4. 커뮤니티

1. 상단 내비게이션 또는 홈 히어로 버튼에서 **커뮤니티** 진입
2. 게시글 목록 확인, **글쓰기**로 새 포스트 작성
3. 게시글 상세에서 댓글 작성·좋아요 가능

### 7-5. 마이페이지

1. 우측 상단 프로필 아이콘 → **마이페이지** 클릭
2. 프로필 사진 업로드, 닉네임 수정
3. 현재 비밀번호 확인 후 새 비밀번호로 변경
4. 크레딧 잔액 확인 및 패키지 선택 후 충전

> **크레딧 충전**: 관리자 코드(`ADMIN_CHARGE_PASSWORD`) 입력 시에만 무료 충전이 가능합니다. 코드 없이 충전 버튼을 누르면 "결제 기능이 준비 중입니다." 안내가 표시됩니다.

### 7-6. 출판·주문 (`SWEETBOOK_API_KEY` 필요)

1. 완성된 프로젝트에서 **출판하기** 클릭 → Book Print API로 Book 생성 완료
2. 발행된 프로젝트(`PUBLISHED`)에서 **주문하기** 클릭
3. 수량·배송지 입력 → 실시간 견적 확인
4. 주문 완료 후 `/status/[orderId]`에서 배송 상태 추적

---

## 8. 스크립트 레퍼런스

```bash
npm run dev                # Next.js 개발 서버 실행 (http://localhost:3000)
npm run build              # 프로덕션 빌드 (prisma generate 포함)
npm run start              # 프로덕션 서버 실행 (build 후 사용)

npx prisma db push         # Supabase PostgreSQL에 스키마 동기화
node prisma/seed.js        # 테스트 계정 생성 + 샘플 프로젝트 2개 + 커뮤니티 포스트 삽입
npm run db:seed            # 위와 동일 (npm 단축 명령)
npm run db:setup           # prisma db push + seed.js 한 번에 실행
npm run db:setup:safe      # DB 백업 후 db:setup 실행 (안전한 재설정)
npm run db:reset           # 스키마 강제 초기화 + seed 재삽입 (데이터 모두 삭제됨)

npm run db:backup          # DB 수동 백업 (scripts/backup-db.js)
npm run db:backup:auto:install    # macOS launchd 자동 백업 등록
npm run db:backup:auto:uninstall  # macOS launchd 자동 백업 제거
npm run db:backup:auto:status     # 자동 백업 등록 상태 확인

node scripts/migrate-uploads.js  # 로컬 public/uploads/ → Supabase Storage 마이그레이션

npm run smoke-test         # 로컬 API 엔드포인트 기본 동작 확인 (서버 실행 상태에서 실행)
npm run probe-templates    # Sweetbook 템플릿 목록 탐색 및 scripts/probe-results.json 캐시
```

---

## 9. 프로젝트 구조

```text
sweetbook/
├── app/
│   ├── page.tsx                     # 홈 (프로젝트 목록)
│   ├── layout.tsx
│   ├── globals.css
│   ├── api/
│   │   ├── ai/generate-book/        # AI 만화·소설 생성 엔드포인트
│   │   ├── auth/                    # 회원가입(이메일 인증 포함)·로그인·로그아웃·세션·프로필·비밀번호 변경
│   │   ├── book-specs/              # 판형 목록 프록시
│   │   ├── community/               # 커뮤니티 게시글·댓글·좋아요 CRUD
│   │   ├── credits/                 # 크레딧 잔액 조회 및 충전
│   │   ├── exchange-rate/           # 환율 조회 (실시간 USD/KRW)
│   │   ├── orders/                  # 주문 생성·조회·견적
│   │   ├── projects/                # 프로젝트 CRUD·페이지 관리·출판
│   │   ├── templates/               # 템플릿 프록시
│   │   ├── upload/                  # 이미지 업로드 (일반 + 캐릭터 참조 이미지)
│   │   └── webhook/                 # Sweetbook 웹훅 수신 및 처리
│   ├── components/
│   │   ├── AuthMenu.tsx             # 로그인/로그아웃/마이페이지 메뉴
│   │   └── ProjectCard.tsx          # 프로젝트 카드 (샘플 배지 포함)
│   ├── community/                   # 커뮤니티 목록·상세 페이지
│   ├── create/                      # 프로젝트 유형 선택 및 AI 생성 진행 화면
│   ├── editor/[projectId]/          # 포토북 에디터
│   ├── login/                       # 로그인
│   ├── profile/                     # 마이페이지 (프로필 사진·닉네임·비밀번호 변경)
│   ├── signup/                      # 회원가입 (3단계: 이메일 → 인증코드 → 정보 입력)
│   ├── order/[projectId]/           # 주문 페이지 (샘플 → 자동 복제 후 주문)
│   ├── status/[orderId]/            # 배송 상태 조회
│   └── view/[projectId]/            # 완성 프로젝트 뷰어
├── lib/
│   ├── ai-generator.ts              # OpenAI 기반 AI 콘텐츠 생성 로직 (캐릭터 참조 이미지 지원)
│   ├── ai-pricing.ts                # AI 생성 비용 예측 (4종 스토리·5종 이미지 모델)
│   ├── auth.ts                      # 세션 인증 헬퍼 (scrypt, HttpOnly 쿠키)
│   ├── book-specs.ts                # 판형 데이터 캐시
│   ├── client.js                    # Sweetbook API SDK 클라이언트 구현
│   ├── core.js                      # SDK 공통 기반 (에러, 파서, BaseClient)
│   ├── credits.ts                   # 크레딧 패키지 정의
│   ├── email.ts                     # 이메일 인증 코드 발송 (nodemailer)
│   ├── order-status.ts              # 주문 상태 정규화 유틸
│   ├── prisma.ts                    # Prisma 클라이언트 싱글턴
│   ├── sweetbook-api.ts             # Book Print API SDK 래퍼
│   ├── template-mappings.ts         # 템플릿 UID 매핑 테이블
│   ├── template-overrides.ts        # 템플릿 필드 오버라이드 유틸
│   └── webhook.js                   # 웹훅 이벤트 처리 로직
├── prisma/
│   ├── schema.prisma                # PostgreSQL provider, directUrl 설정
│   ├── seed.js                      # 테스트 계정 + 샘플 프로젝트 2종(만화·소설) + 커뮤니티 포스트 시드
│   └── migrations/
├── public/
│   └── uploads/                     # 로컬 개발용 임시 디렉터리
│                                    # (프로덕션은 Supabase Storage 사용)
├── scripts/
│   ├── backup-db.js                 # DB 수동 백업
│   ├── check-urls.js                # URL 유효성 검사
│   ├── install-db-backup-launchd.sh # macOS launchd 자동 백업 등록
│   ├── migrate-uploads.js           # 로컬 uploads → Supabase Storage 마이그레이션
│   ├── probe-templates.js           # 템플릿 탐색 캐시 생성
│   ├── smoke-test.js                # API 엔드포인트 동작 검증
│   ├── uninstall-db-backup-launchd.sh # macOS launchd 자동 백업 제거
│   ├── verify-pricing.js            # 크레딧 요금 체계 검증
│   └── verify-pricing.ts            # (TypeScript 버전)
├── types/
│   └── index.ts                     # 공용 TypeScript 타입 정의
├── middleware.ts                    # 인증 미들웨어 (보호 라우트 처리)
└── .env.example                     # 환경 변수 예시
```

---

## 10. 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript |
| DB / ORM | Prisma + Supabase PostgreSQL |
| 파일 저장소 | Supabase Storage |
| 배포 | Vercel Pro (도쿄 리전 hnd1, maxDuration 300초) |
| 스타일링 | Tailwind CSS |
| 인증 | 자체 구현 (scrypt 해시, HttpOnly 세션 쿠키) |
| AI 텍스트 | OpenAI API (`gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4.1` 선택) |
| AI 이미지 | OpenAI API (`dall-e-2`, `dall-e-3`, `dall-e-3-hd`, `gpt-image-1`, `gpt-image-1-hd` 선택) |
| 이메일 | nodemailer (SMTP) — 미설정 시 인증 단계 자동 우회 |
| 출판·주문 *(선택)* | Sweetbook Book Print API |

---

## 11. Book Print API 사용 목록

| API / 기능 | 서비스 내 용도 |
|---|---|
| `books.create` | 출판 시작 시 Book UID 발급 |
| `books/covers` | 표지 템플릿 적용 |
| `books/contents` | 내지 페이지(템플릿 오버라이드 포함) 삽입 |
| `books.finalize` | 책 완성 처리 (출판 완료) |
| `orders.estimate` | 주문 전 실시간 가격 견적 조회 |
| `orders.create` | 주문 생성 |
| `orders.get` | 주문 상태 조회 |
| `GET /templates` | 템플릿 목록 및 필드 정의 조회 |
| `GET /templates/{templateUid}` | 개별 템플릿 상세·필수 입력값 조회 |
| `GET /book-specs` | 판형 목록 조회 |
| Webhook (`POST /api/webhook`) | 주문·배송 상태 변경 이벤트 수신 |

---

## 12. 사용 AI 모델

| 구분 | 모델 | 설명 |
|---|---|---|
| 텍스트 (스토리) | `gpt-4o-mini` | 기본 — 가성비 |
| 텍스트 (스토리) | `gpt-4.1-mini` | 균형 |
| 텍스트 (스토리) | `gpt-4o` | 고품질 |
| 텍스트 (스토리) | `gpt-4.1` | 최신 최고품질 |
| 이미지 | `dall-e-2` | 가성비 |
| 이미지 | `dall-e-3` / `dall-e-3-hd` | 균형 / 고품질 |
| 이미지 | `gpt-image-1` / `gpt-image-1-hd` | 최고품질 — 캐릭터 참조 이미지(Responses API) 지원 |

---

## 13. 설계 의도

### 기획 배경

AI를 이용한 스토리·이미지 생성부터 커뮤니티 공유, 실제 책 제작·주문까지 이어지는 end-to-end 창작 플랫폼을 구현하는 것이 목표입니다. "아이디어 하나로 완성된 책을 만든다"는 경험의 장벽을 AI로 낮추고, 커뮤니티를 통해 창작물의 소비와 확산이 일어나는 선순환 구조를 지향합니다.

### AI 생성 내구성 설계

- **페이지 증분 저장**: 소설·만화 생성 중 페이지가 완성될 때마다 즉시 DB에 upsert하여, 중단 시에도 이미 생성된 페이지가 보존됩니다.
- **아웃라인 캐시**: 소설 생성 시 챕터·캐릭터 아웃라인을 `generationMetadata`에 JSON 캐시하여 재개 시 AI 재호출 없이 이어서 집필합니다.
- **자동 재개**: progress 화면이 5분간 상태 변화가 없으면 자동으로 `/generate` API를 재호출합니다. API는 `updatedAt` 기준 stuck 여부를 판단해 resume 경로로 진입하며, 크레딧을 재차감하지 않습니다.
- **Vercel timeout 대응**: `maxDuration: 300`으로 최대 허용 시간을 확보하고, resume 시스템으로 그 이상도 완주할 수 있도록 설계했습니다.

### 기본 샘플 프로젝트 설계

- 샘플 프로젝트는 `seed.js` 실행 시 테스트 계정(`a@a.a`)의 소유로 생성됩니다 (`userId: testUser.id`, `isDefault: false`).
- 신규 가입 계정에서는 샘플이 표시되지 않으며, 테스트 계정으로 로그인해야 샘플을 확인할 수 있습니다.
- `db:reset` 이후에도 테스트 계정과 샘플이 재생성됩니다.

### 비즈니스 가능성

- AI 생성형 콘텐츠(만화·소설)와 출판 기능의 결합은 1인 창작자의 작품 제작 장벽을 크게 낮춥니다.
- 커뮤니티 기능이 창작물 소비·공유의 생태계를 형성하며 서비스 체류 시간과 재방문을 높입니다.
- 크레딧 기반 수익 모델은 API 비용과 직결되어 건전한 과금 구조를 가집니다.

### 향후 계획

- 결제 시스템 연동 (토스페이먼츠·카카오페이 등) 및 크레딧 유료 구매
- 소셜 로그인 (카카오·구글) 연동
- 커뮤니티 게시글 기반 프로젝트 공유·댓글·팔로우 확장
- 팀 공동 편집 협업 기능
- 관리자 대시보드 (주문·에러·사용량 분석)
- Background job 분리 (Inngest/QStash) — 현재 Next.js 14 제약으로 resume 방식 대체 중

---

## 14. 보안 유의사항

- 실제 API Key가 들어간 `.env`는 절대 커밋하지 마세요 (`.gitignore`에 포함됨).
- 공개 저장소에는 `.env.example`만 포함하세요.
- `AUTH_SECRET`은 `openssl rand -base64 32`로 생성한 32자 이상 임의 문자열을 사용하세요.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 사이드 전용입니다. 클라이언트 코드에 노출하지 마세요.
- `ADMIN_CHARGE_PASSWORD`는 기본값(`Test1234!`)을 프로덕션 환경에서 반드시 변경하세요. 해당 암호를 아는 사람은 누구든 크레딧을 무료 충전할 수 있습니다.
- Vercel 배포 시 모든 환경변수를 Vercel 대시보드 → Settings → Environment Variables에 설정하세요.
