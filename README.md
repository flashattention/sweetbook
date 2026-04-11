# Dreamcatcher — AI 북 제작 서비스

> Sweetbook Book Print API를 기반으로, 사용자가 포토북·AI 만화·AI 소설 프로젝트를 만들고 실제 책으로 주문할 수 있는 웹 애플리케이션입니다.

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
12. [AI 도구 사용 내역](#12-ai-도구-사용-내역)
13. [설계 의도](#13-설계-의도)
14. [과제 요구사항 체크리스트](#14-과제-요구사항-체크리스트)
15. [보안 유의사항](#15-보안-유의사항)

---

## 1. 서비스 소개

### 한 문장 요약

사용자가 포토북·만화·소설 프로젝트를 만들고 실제 책 주문까지 연결하는 AI 기반 북 제작 서비스입니다.

### 타겟 고객

- 아이 성장기·가족 추억을 책으로 남기고 싶은 개인 사용자
- 사진·글을 소량 출판하려는 1인 창작자
- 유치원·학원·동아리처럼 기록물을 책 형태로 남기고 싶은 그룹

### 주요 기능

- **포토북 편집**: 이미지·템플릿·추가 입력을 편집한 뒤 출판
- **AI 만화 생성**: 시놉시스 입력 → 이미지+스토리 자동 생성 → 출판/주문
- **AI 소설 생성**: 시놉시스 입력 → 페이지별 본문 자동 생성 → 출판/주문
- **주문·배송 상태 조회**: 주문 생성, 실시간 견적, 상태 추적
- **계정 기반 데이터 분리**: 회원가입·로그인·세션 인증
- **기본 샘플 프로젝트**: 로그인한 모든 사용자에게 완성된 샘플 3종 자동 표시

---

## 2. 사전 준비

| 항목 | 요구사항 |
|---|---|
| Node.js | **≥ 18.0.0** |
| npm | ≥ 9.0.0 (Node 18+ 기본 포함) |
| Sweetbook API Key | 출판·주문 기능에 필요 (없으면 해당 단계에서 오류) |
| OpenAI API Key | AI 만화·소설 생성 기능에 필요 |

> **API Key 없이도** 기존 샘플 프로젝트 조회, 에디터 UI 탐색 등 대부분의 화면을 확인할 수 있습니다.

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
# .env를 열어 API 키를 입력합니다 (아래 [환경 변수] 섹션 참고)

# 4. DB 초기화 (샘플 데이터 포함)
npm run db:setup

# 5. 개발 서버 실행
npm run dev
```

브라우저에서 확인: **http://localhost:3000**

> `npm run db:setup`이 스키마 동기화와 시드를 함께 실행합니다.  
> 시드가 샘플 프로젝트 3개를 자동 생성하므로, 실행 직후 홈 화면에서 샘플을 확인할 수 있습니다.

DB를 완전히 초기화하고 싶은 경우:

```bash
npm run db:reset   # ⚠️ 모든 데이터 삭제 후 초기 상태로 재생성
```

---

## 4. 환경 변수

`.env.example`을 복사해 `.env`에 실제 값을 입력하세요.

```env
# ── 필수 ──────────────────────────────────────────────────────────────────
AUTH_SECRET=replace_with_random_secret_min_16_chars   # 세션 서명 키 (필수)
DATABASE_URL="file:./dev.db"                           # SQLite 파일 경로

# ── Sweetbook Book Print API ───────────────────────────────────────────────
SWEETBOOK_API_KEY=SB_YOUR_API_KEY      # 출판·주문 기능에 필요
SWEETBOOK_ENV=sandbox                  # sandbox | production
SWEETBOOK_WEBHOOK_SECRET=your_secret   # 웹훅 서명 검증용

# ── 기본 템플릿 (선택 — 없으면 프로젝트 설정값 사용) ───────────────────────
SWEETBOOK_COVER_TEMPLATE_UID=39kySqmyRhhs
SWEETBOOK_CONTENT_TEMPLATE_UID=46VqZhVNOfAp

# ── OpenAI (AI 만화·소설 생성) ─────────────────────────────────────────────
OPENAI_API_KEY=your_openai_api_key

# ── 선택 항목 ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000   # 상대 이미지 URL 해상에 사용
APP_BASE_URL=http://localhost:3000
```

| 변수 | 필수 여부 | 설명 |
|---|---|---|
| `AUTH_SECRET` | **필수** | 세션 쿠키 서명용. 최소 16자 임의 문자열 |
| `DATABASE_URL` | **필수** | SQLite 파일 경로. 기본값 그대로 사용 가능 |
| `SWEETBOOK_API_KEY` | 출판·주문 시 필수 | 없으면 출판/주문 단계에서 오류 발생 |
| `SWEETBOOK_ENV` | 권장 | `sandbox` 또는 `production` |
| `SWEETBOOK_WEBHOOK_SECRET` | 권장 | 웹훅 이벤트 서명 검증 |
| `SWEETBOOK_COVER_TEMPLATE_UID` | 선택 | 폴백 표지 템플릿 UID (프로젝트 설정값 우선) |
| `SWEETBOOK_CONTENT_TEMPLATE_UID` | 선택 | 폴백 내지 템플릿 UID (프로젝트 설정값 우선) |
| `OPENAI_API_KEY` | AI 기능 시 필수 | AI 만화·소설 생성에 필요 |
| `NEXT_PUBLIC_APP_URL` | 선택 | 이미지 URL 절대 경로 해상용 (기본: `http://localhost:3000`) |

---

## 5. 기본 샘플 프로젝트

로그인한 **모든 사용자**에게 완성된 샘플 프로젝트 3종이 홈 화면에 자동으로 표시됩니다.

| 제목 | 유형 | 내용 |
|---|---|---|
| 우리의 첫 번째 이야기 | 포토북 (SQUAREBOOK HC, 24페이지) | 다양한 템플릿이 적용된 포토북 완성 예시 |
| 슈퍼파워 고양이 | AI 만화 (판타지, AMERICAN 스타일, 24컷) | AI가 생성한 이미지·캡션으로 완성된 만화 |
| 선생님의 안경 | AI 소설 (미스테리, 24페이지) | AI가 생성한 본문으로 완성된 소설 |

### 동작 방식

샘플 프로젝트는 특정 계정이 **소유하지 않습니다** (`userId: null`, `isDefault: true`). 동작 규칙은 다음과 같습니다.

- 로그인한 모든 사용자의 홈 화면에 **"샘플" 배지**와 함께 표시됩니다.
- 신규 회원가입 직후에도 즉시 3개 샘플을 볼 수 있습니다.
- 샘플 프로젝트는 **삭제할 수 없습니다** (삭제 버튼이 표시되지 않음).
- **주문하기**를 클릭하면 현재 사용자의 계정으로 프로젝트가 자동 복제되어 주문이 진행됩니다 (원본 샘플 보존).
- `npm run db:reset` 또는 `npm run db:setup` 실행 시 샘플 프로젝트가 항상 재생성됩니다.

### 이미지 파일

만화 샘플(`슈퍼파워 고양이`)의 실제 이미지 파일과 소설 샘플의 표지 이미지는 `public/uploads/`에 저장소와 함께 커밋되어 있습니다. DB 초기화 후에도 이미지가 정상 표시됩니다.

---

## 6. 테스트 계정

저장소 클론 후 `npm run db:setup` 또는 `npm run db:reset` 실행 이후 사용 가능합니다.

| 이메일 | 비밀번호 |
|---|---|
| `a@a.a` | `Test1234!` |

로그인하면 홈 화면에서 3개의 샘플 프로젝트를 즉시 확인할 수 있습니다.  
**신규로 회원가입한 계정**에서도 동일하게 3개 샘플이 표시됩니다.

---

## 7. 주요 사용자 흐름

### 7-1. 샘플 프로젝트 체험 (API Key 불필요)

1. `npm run dev` 실행
2. `http://localhost:3000/login`에서 테스트 계정(`a@a.a` / `Test1234!`) 로그인
3. 홈 화면에서 "샘플" 배지가 붙은 3개 프로젝트 확인
4. **슈퍼파워 고양이** 클릭 → 만화 페이지 뷰어 확인
5. **주문하기** 클릭 → 계정으로 자동 복제 → 주문 페이지 진입

### 7-2. 포토북 신규 생성 및 출판 (`SWEETBOOK_API_KEY` 필요)

1. 홈 화면에서 **+ 만들기** 클릭
2. 포토북 선택 → 판형 선택 (`SQUAREBOOK_HC` 권장 — 최소 24페이지)
3. 에디터에서 이미지 업로드 및 템플릿 편집
4. **출판하기** 클릭 → Book Print API로 Book 생성 및 완성 처리
5. 출판 성공 후 주문 페이지 진입 가능

### 7-3. AI 만화·소설 신규 생성 (`OPENAI_API_KEY` + `SWEETBOOK_API_KEY` 필요)

1. 홈 화면에서 **+ 만들기** 클릭
2. **AI 만화** 또는 **AI 소설** 선택
3. 장르·캐릭터·시놉시스 입력 → **생성 시작**
4. 진행 화면(`/create/progress/[id]`)에서 실시간 생성 상태 확인
5. 생성 완료 후 에디터에서 수정 → 출판 → 주문

### 7-4. 주문 및 배송 상태 확인 (`SWEETBOOK_API_KEY` 필요)

1. 발행된 프로젝트(`PUBLISHED`)에서 **주문하기** 클릭
2. 수량·배송지 입력 → 실시간 견적 확인
3. 주문 완료 후 `/status/[orderId]`에서 배송 상태 추적

---

## 8. 스크립트 레퍼런스

```bash
npm run dev                # Next.js 개발 서버 실행 (http://localhost:3000)
npm run build              # 프로덕션 빌드
npm run start              # 프로덕션 서버 실행 (build 후 사용)

npm run db:setup           # prisma db push (스키마 동기화) + 시드 실행 [비파괴적]
npm run db:seed            # 시드만 실행 (스키마 변경 없음)
npm run db:reset           # ⚠️ DB 강제 초기화 + 시드 (모든 데이터 삭제)

npm run db:backup          # DB 수동 백업 → prisma/backups/ 에 타임스탬프 파일 생성

npm run smoke-test         # 로컬 API 엔드포인트 기본 동작 확인 (서버 실행 상태에서 실행)
npm run probe-templates    # Sweetbook 템플릿 목록 탐색 및 scripts/probe-results.json 캐시
```

| 명령 | 스키마 적용 | 데이터 삭제 | 시드 실행 |
|---|---|---|---|
| `db:setup` | ✅ (안전, 비파괴적) | ❌ | ✅ |
| `db:seed` | ❌ | ❌ | ✅ |
| `db:reset` | ✅ (강제 재설정) | **⚠️ 전체** | ✅ |

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
│   │   ├── auth/                    # 회원가입·로그인·로그아웃·세션 확인
│   │   ├── book-specs/              # 판형 목록 프록시
│   │   ├── exchange-rate/           # 환율 조회
│   │   ├── orders/                  # 주문 생성·조회·견적
│   │   ├── projects/                # 프로젝트 CRUD·페이지 관리·출판
│   │   ├── templates/               # 템플릿 프록시
│   │   ├── upload/                  # 이미지 업로드
│   │   └── webhook/                 # Sweetbook 웹훅 수신 및 처리
│   ├── components/
│   │   ├── AuthMenu.tsx             # 로그인/로그아웃 메뉴
│   │   └── ProjectCard.tsx          # 프로젝트 카드 (샘플 배지 포함)
│   ├── create/                      # 프로젝트 유형 선택 및 AI 생성 진행 화면
│   ├── editor/[projectId]/          # 포토북 에디터
│   ├── login/                       # 로그인
│   ├── signup/                      # 회원가입
│   ├── order/[projectId]/           # 주문 페이지 (샘플 → 자동 복제 후 주문)
│   ├── status/[orderId]/            # 배송 상태 조회
│   └── view/[projectId]/            # 완성 프로젝트 뷰어
├── lib/
│   ├── ai-generator.ts              # OpenAI 기반 AI 콘텐츠 생성 로직
│   ├── ai-pricing.ts                # AI 생성 비용 예측 유틸
│   ├── auth.ts                      # 세션 인증 헬퍼 (scrypt, HttpOnly 쿠키)
│   ├── book-specs.ts                # 판형 데이터 캐시
│   ├── prisma.ts                    # Prisma 클라이언트 싱글턴
│   ├── sweetbook-api.ts             # Book Print API SDK 래퍼
│   ├── template-mappings.ts         # 템플릿 UID 매핑 테이블
│   └── template-overrides.ts        # 템플릿 필드 오버라이드 유틸
├── prisma/
│   ├── schema.prisma
│   ├── seed.js                      # 기본 샘플 프로젝트 시드 (isDefault 3종)
│   ├── dev.db                       # ⚠️ gitignore — npm run db:setup 으로 생성
│   └── migrations/
├── public/
│   └── uploads/                     # 사용자 업로드 디렉터리
│                                    # (샘플용 이미지 26종 저장소에 포함)
├── scripts/
│   ├── smoke-test.js                # API 엔드포인트 동작 검증
│   ├── probe-templates.js           # 템플릿 탐색 캐시 생성
│   └── backup-db.js                 # DB 수동 백업
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
| DB / ORM | Prisma + SQLite |
| 스타일링 | Tailwind CSS |
| 인증 | 자체 구현 (scrypt 해시, HttpOnly 세션 쿠키) |
| AI 텍스트 | OpenAI API (`gpt-4o-mini`, `gpt-4.1-mini` 선택 가능) |
| AI 이미지 | OpenAI API (`gpt-image-1`, `dall-e-2`) |
| 외부 API | Sweetbook Book Print API |

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

## 12. AI 도구 사용 내역

| AI 도구 | 활용 내용 |
|---|---|
| GitHub Copilot Chat | 라우트 구현·상태 흐름·템플릿 처리 로직 구현 및 리팩터링 |
| OpenAI `gpt-4o-mini` / `gpt-4.1-mini` | AI 만화·소설 텍스트 및 페이지 캡션 생성 (기본: gpt-4o-mini) |
| OpenAI `gpt-image-1` / `dall-e-2` | AI 만화 표지·페이지 이미지 생성 |

---

## 13. 설계 의도

### 왜 이 서비스를 선택했는가

단순 CRUD가 아닌, 실제 사용자 가치(책 제작·주문)까지 이어지는 end-to-end 제품 흐름을 구현하기 위해 선택했습니다. Book Print API의 핵심 가치인 "콘텐츠를 실물 책으로 전환"을 가장 직관적으로 드러낼 수 있는 도메인입니다.

### 기본 샘플 프로젝트 설계

- 샘플 프로젝트는 특정 사용자 계정에 귀속되지 않고(`userId: null`), `isDefault: true` 플래그로 모든 로그인 사용자에게 표시됩니다.
- 신규 가입자도 온보딩 직후 즉시 완성된 3종 샘플을 볼 수 있어 서비스 가치를 빠르게 이해할 수 있습니다.
- 샘플을 주문할 때 현재 사용자 계정으로 자동 복제되어 원본은 항상 보존됩니다.
- `db:reset` 이후에도 샘플이 재생성되고, 이미지 파일은 저장소에 포함되어 항상 정상 표시됩니다.

### 비즈니스 가능성

- 개인 추억 기록 시장(육아·여행·기념일)은 반복 구매 가능성이 높습니다.
- AI 생성형 콘텐츠(만화·소설)와 결합하면 사용자 제작 장벽을 크게 낮출 수 있습니다.
- 템플릿 기반 제작으로 운영 자동화가 가능하며 B2C/B2B(교육기관, 소모임) 확장성이 있습니다.

### 더 시간이 있었다면

- 템플릿 호환성 사전 검증 UI 강화 (필수 입력값 자동 추천)
- 팀·가족 공동 편집 협업 기능
- 장바구니·복수 권수 할인 정책
- 출판 실패 자동 복구 워크플로우 고도화
- 관리자 대시보드 (주문·에러·사용량 분석)

---

## 14. 과제 요구사항 체크리스트

- [x] 최종 사용자 프론트엔드 UI 제공
- [x] 백엔드에서 API Key 관리 및 Book Print API 통신
- [x] Books API + Orders API 사용
- [x] 샘플 데이터 포함 — `npm run db:setup` 실행 시 샘플 프로젝트 3개 자동 생성
- [x] `.env.example` 제공 및 키 하드코딩·커밋 방지 (`.env`는 `.gitignore` 처리)
- [x] 로컬 실행 절차 명시
- [x] GitHub 저장소 Public 설정 (https://github.com/flashattention/sweetbook)

---

## 15. 보안 유의사항

- 실제 API Key가 들어간 `.env`는 절대 커밋하지 마세요 (`.gitignore`에 포함됨).
- 공개 저장소에는 `.env.example`만 포함하세요.
- 프로덕션에서는 최소 32자 이상의 임의 문자열로 `AUTH_SECRET`을 설정하세요.
- `prisma/dev.db`는 `.gitignore` 처리됩니다. 프로덕션에서는 적절한 DB로 교체하세요.
