# Sweetbook

Next.js 14 기반 멀티 북 제작 웹앱입니다.

- 포토북: 생성 -> 편집 -> 출판 -> 주문
- AI 만화: 생성(병렬 이미지 생성 + 체크포인트) -> 출판 -> 주문
- AI 소설: 아웃라인 생성 -> 페이지별 본문 생성(연속성 유지) -> 출판 -> 주문
- 계정 기반 접근 제어(회원가입/로그인/세션)
- Sweetbook Sandbox/Live 연동

## 기술 스택

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite
- OpenAI API (gpt-4o-mini / gpt-4.1-mini, dall-e-2 / gpt-image-1)
- Tailwind CSS
- Sweetbook API

## 핵심 기능

- 인증
  - 이메일/비밀번호 회원가입
  - 로그인/로그아웃
  - 세션 쿠키(sb_session) 기반 인증
  - 비밀번호 정책: 8자 이상 + 영문/숫자/특수문자 포함
- 권한
  - 미들웨어 기반 보호 페이지/API 접근 제어
  - 프로젝트/주문/업로드 API 사용자 소유권 검증
- 템플릿
  - 생성 화면에서 판형별 표지/내지 템플릿 선택
  - 서버/클라이언트 캐시로 템플릿 호출 수 절감
  - publish 실패 시 필수 입력(requiredInputs) 반환 + 재시도 보정
- 제작/주문
  - 포토북 편집/출판/주문/상태 조회
  - AI 만화/소설 생성 후 출판/주문
- AI 만화 생성 (`lib/ai-generator.ts`)
  - 1단계: 스토리 플랜 생성(전체 줄거리 + 캐릭터 프로필 + 페이지별 대사/숏방향)
  - 2단계: 표지 이미지 먼저 생성 → 캐릭터 외형 고정(visual lock) → 각 페이지 이미지 병렬 생성
  - 병렬 워커: dall-e-2 최대 6개, gpt-image-1 최대 4개
  - 이미지 생성 실패 시 자동 재시도 2회
  - 체크포인트(`.cache/comic-checkpoints/<projectId>.json`)로 중단 재개 지원
  - 스토리 모델: `gpt-4o-mini` (기본, 가성비) / `gpt-4.1-mini` (품질 우선)
  - 이미지 모델: `gpt-image-1` (기본, 품질 우선) / `dall-e-2` (가성비)
- AI 소설 생성 (`lib/ai-generator.ts`)
  - 1단계: 전체 아웃라인 생성(tagline/synopsis/characterProfiles/chapters/pageBlueprints)
  - 2단계: 페이지별 본문 순차 생성 — 이전 1~2페이지 내용 + 페이지 블루프린트(beat/emotion/keyDetail) 포함
  - 목표 분량: 1000자 내외(800~1200자 권장), 짧으면 자동 강화 재시도 1회
  - 표지 이미지는 `generateStoryCoverImage()`로 별도 생성
- OpenAI 쿼타 오류 처리
  - HTTP 429 + 쿼타 관련 코드/메시지 감지 시 즉시 생성 중단
  - API 라우트(`/api/projects/:id/generate`)에서 HTTP 429 + `errorCode: "OPENAI_QUOTA_EXCEEDED"` 반환
  - 프로그레스 페이지에서 감지 시 한국어 경고 알림 표시 후 홈으로 리다이렉트

## 실행 방법

### 1) 설치

```bash
npm install
```

### 2) 환경 변수 설정

.env에 최소 아래 값이 필요합니다.

```env
SWEETBOOK_API_KEY=SB_YOUR_API_KEY
SWEETBOOK_ENV=sandbox
SWEETBOOK_WEBHOOK_SECRET=your_webhook_secret
AUTH_SECRET=replace_with_random_secret_min_16_chars

# 기본 템플릿 UID (없으면 프로젝트 저장값 사용)
SWEETBOOK_COVER_TEMPLATE_UID=39kySqmyRhhs
SWEETBOOK_CONTENT_TEMPLATE_UID=46VqZhVNOfAp

OPENAI_API_KEY=...
DATABASE_URL="file:./dev.db"
```

참고

- 프로덕션에서는 AUTH_SECRET 필수입니다.
- lib/auth.ts는 AUTH_SECRET이 없으면 NEXTAUTH_SECRET을 fallback으로 사용합니다.
- 현재 앱 인증 흐름은 NextAuth/OAuth를 사용하지 않습니다.

### 3) DB 초기화

```bash
npm run db:setup
```

### 4) 개발 서버 실행

```bash
npm run dev
```

## npm 스크립트

- npm run dev: 개발 서버
- npm run build: 프로덕션 빌드
- npm run start: 프로덕션 서버
- npm run db:setup: DB push + seed
- npm run db:seed: seed만 실행
- npm run db:reset: DB 리셋 + seed
- npm run smoke-test: 대표 템플릿 조합 스모크 테스트
- npm run probe-templates: 템플릿 실제 호출 프로브 (결과 파일 생성)

## 주요 API

- 인증
  - POST /api/auth/signup
  - POST /api/auth/login
  - POST /api/auth/logout
  - GET /api/auth/me
- 프로젝트
  - GET /api/projects
  - POST /api/projects
  - GET /api/projects/:id
  - PATCH /api/projects/:id
  - DELETE /api/projects/:id
- 페이지
  - GET /api/projects/:id/pages
  - POST /api/projects/:id/pages
  - PATCH /api/projects/:id/pages/:pageId
  - DELETE /api/projects/:id/pages/:pageId
  - POST /api/projects/:id/pages/reorder
- 생성/출판
  - POST /api/projects/:id/generate
  - POST /api/projects/:id/publish
- AI 생성 (내부)
  - POST /api/ai/generate-book
- 템플릿/판형
  - GET /api/templates
  - GET /api/book-specs
- 주문
  - POST /api/orders/estimate
  - POST /api/orders
  - GET /api/orders
  - GET /api/orders/:orderUid
- 기타
  - GET /api/exchange-rate
  - POST /api/upload
  - POST /api/webhook

## 인증/권한 정책

- 쿠키명: sb_session
- 세션 만료: 14일
- 보호 페이지: /create, /editor, /order, /status, /view
- 보호 API: /api/projects, /api/orders, /api/upload
- 비인증 접근 시
  - 페이지: /login으로 리다이렉트(next 파라미터 포함)
  - API: 401 JSON 응답

## 템플릿 지원 정책 (현재 코드 기준)

### 1) 생성 화면

- 판형 기준 cover/content 템플릿을 모두 노출합니다.
- compatibility=publish 응답의 publishSupport는 참고 정보로만 사용합니다.
- 클라이언트 캐시(localStorage) TTL 10분으로 템플릿 목록 재사용합니다.

### 2) 출판 API (POST /api/projects/:id/publish)

- 템플릿 상세(GET /templates/:uid)를 읽어 파라미터/파일을 동적으로 구성합니다.
- 텍스트 값은 UID 오버라이드 -> 키워드 규칙 -> fallback 순서로 자동 채웁니다.
- text/file 외 바인딩도 기본 타입 규칙으로 채워 전송합니다.
- 템플릿 kind/bookSpec 불일치는 경고 로그로 남기고 가능한 범위에서 계속 진행합니다.
- 서버 캐시
  - 템플릿 목록 캐시 TTL 5분
  - 템플릿 상세 캐시 TTL 30분

### 3) 유저 데이터 기반 오류 보정

출판 요청 바디에 오버라이드를 전달할 수 있습니다.

```json
{
  "coverOverrides": {
    "parameters": { "title": "우리의 책" },
    "fileUrls": { "coverPhoto": "https://.../cover.jpg" }
  },
  "contentOverrides": {
    "parameters": { "diaryText": "본문" },
    "fileUrls": { "photo": ["https://.../1.jpg", "https://.../2.jpg"] }
  },
  "contentPageOverrides": {
    "1": {
      "parameters": { "dayLabel": "04.09" },
      "fileUrls": { "photo": "https://.../p1.jpg" }
    }
  }
}
```

실패 시 응답에 아래 정보가 포함됩니다.

- failedStep
- requiredInputs.cover[]
- requiredInputs.content[]

## 템플릿 프로브

모든 템플릿을 실제로 호출해 성공/실패를 수집할 수 있습니다.

```bash
# 예시: SQUAREBOOK_HC 전체(cover+content)
npm run probe-templates -- --bookSpec SQUAREBOOK_HC --kind all

# cover만 10개
npm run probe-templates -- --bookSpec SQUAREBOOK_HC --kind cover --limit 10
```

결과 파일:

- scripts/probe-results.json

## 대표 제약 사항

- Sweetbook API 스키마가 템플릿마다 달라 100% 자동 성공을 보장할 수 없습니다.
- SQUAREBOOK_HC는 최소 페이지 수 제약이 있습니다. 현재 코드는 book-specs 기준 최소 페이지를 검증합니다.
- 일부 템플릿은 외부 API 정책 변경으로 추가 필드를 요구할 수 있습니다.
- 429(Too Many Requests) 완화를 위해 캐시를 사용하지만, 대량 호출 시 rate limit이 발생할 수 있습니다.

## 디렉터리 요약

```text
app/
  api/
    ai/
      generate-book/     # AI 생성 내부 API
    auth/                # 회원가입/로그인/로그아웃/me
    book-specs/
    exchange-rate/
    orders/
    projects/
      [id]/
        generate/        # AI 만화·소설 생성
        pages/
        publish/
    templates/
    upload/
    webhook/
  components/
  create/
    progress/[projectId] # AI 생성 진행 화면(폴링 + 쿼타 에러 처리)
  editor/                # 포토북 편집기
  login/
  order/
  signup/
  status/
  view/
lib/
  ai-generator.ts        # AI 만화·소설 생성 엔진
  ai-pricing.ts          # 모델 옵션 및 비용 계산
  auth.ts
  book-specs.ts
  client.js
  core.js
  order-status.ts
  prisma.ts
  sweetbook-api.ts
  template-mappings.ts
  template-overrides.ts
scripts/
  smoke-test.js
  probe-templates.js
  probe-results.json
prisma/
  schema.prisma
  seed.js
types/
.cache/
  comic-checkpoints/     # 만화 이미지 생성 체크포인트 (자동 생성)
```
