# Momento Book Studio

Next.js 14 기반 멀티 북 제작 웹앱입니다.

- 포토북: 생성 -> 편집 -> 출판 -> 주문
- AI 만화/소설: 생성 -> 출판 -> 주문
- Sweetbook Sandbox/Live 연동

## 기술 스택

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite
- OpenAI API
- Tailwind CSS
- Sweetbook API

## 실행 방법

### 1) 설치

```bash
npm install
```

### 2) 환경 변수 설정

`.env`에 최소 아래 값이 필요합니다.

```env
SWEETBOOK_API_KEY=SB_YOUR_API_KEY
SWEETBOOK_ENV=sandbox
SWEETBOOK_WEBHOOK_SECRET=your_webhook_secret

# 기본 템플릿 UID (없으면 프로젝트 저장값 사용)
SWEETBOOK_COVER_TEMPLATE_UID=39kySqmyRhhs
SWEETBOOK_CONTENT_TEMPLATE_UID=46VqZhVNOfAp

OPENAI_API_KEY=...
DATABASE_URL="file:./dev.db"
```

### 3) DB 초기화

```bash
npm run db:setup
```

### 4) 개발 서버 실행

```bash
npm run dev
```

## npm 스크립트

- `npm run dev`: 개발 서버
- `npm run build`: 프로덕션 빌드
- `npm run start`: 프로덕션 서버
- `npm run db:setup`: DB push + seed
- `npm run db:seed`: seed만 실행
- `npm run db:reset`: DB 리셋 + seed
- `npm run smoke-test`: 대표 템플릿 조합 스모크 테스트
- `npm run probe-templates`: 템플릿 실제 호출 프로브 (결과 파일 생성)

## 주요 API

- 프로젝트
  - `GET /api/projects`
  - `POST /api/projects`
  - `GET /api/projects/:id`
  - `PATCH /api/projects/:id`
  - `DELETE /api/projects/:id`
- 페이지
  - `GET /api/projects/:id/pages`
  - `POST /api/projects/:id/pages`
  - `PATCH /api/projects/:id/pages/:pageId`
  - `DELETE /api/projects/:id/pages/:pageId`
  - `POST /api/projects/:id/pages/reorder`
- 생성/출판
  - `POST /api/projects/:id/generate`
  - `POST /api/projects/:id/publish`
- 템플릿/판형
  - `GET /api/templates`
  - `GET /api/book-specs`
- 주문
  - `POST /api/orders/estimate`
  - `POST /api/orders`
  - `GET /api/orders/:orderUid`

## 템플릿 지원 정책 (현재 코드 기준)

### 1) 생성 화면

- 판형 기준 cover/content 템플릿을 모두 노출합니다.
- `compatibility=publish` 응답의 `publishSupport`는 참고 정보로만 사용합니다.

### 2) 출판 API (`POST /api/projects/:id/publish`)

- 템플릿 상세(`GET /templates/:uid`)를 읽어 파라미터/파일을 동적으로 구성합니다.
- 텍스트 값은 UID 오버라이드 -> 키워드 규칙 -> fallback 순서로 자동 채웁니다.
- text/file 외 바인딩도 기본 타입 규칙으로 채워 전송합니다.
- 템플릿 kind/bookSpec 불일치는 경고 로그로 남기고 가능한 범위에서 계속 진행합니다.

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

- `failedStep`
- `requiredInputs.cover[]`
- `requiredInputs.content[]`

편집기 화면([app/editor/[projectId]/EditorClient.tsx](app/editor/[projectId]/EditorClient.tsx))에서는 이 정보를 이용해 유저 입력을 받아 즉시 재시도합니다.

## 템플릿 프로브

모든 템플릿을 실제로 호출해 성공/실패를 수집할 수 있습니다.

```bash
# 예시: SQUAREBOOK_HC 전체(cover+content)
npm run probe-templates -- --bookSpec SQUAREBOOK_HC --kind all

# cover만 10개
npm run probe-templates -- --bookSpec SQUAREBOOK_HC --kind cover --limit 10
```

결과 파일:

- [scripts/probe-results.json](scripts/probe-results.json)

## 대표 제약 사항

- Sweetbook API 스키마 자체가 템플릿마다 달라, 100% 자동 성공을 보장하려면 템플릿별 사용자 입력 보정이 필요할 수 있습니다.
- SQUAREBOOK_HC는 최소 페이지 수 제약이 있습니다. 현재 코드에서는 `book-specs` 기준 최소 페이지를 검증합니다.
- 일부 템플릿은 외부 API 정책 변경에 따라 추가 필드를 요구할 수 있습니다. 이 경우 `probe-templates` 결과를 기준으로 오버라이드 규칙을 업데이트하세요.

## 디렉터리 요약

```text
app/
  api/
  create/
  editor/
  order/
  status/
  view/
lib/
  ai-pricing.ts
  book-specs.ts
  prisma.ts
  sweetbook-api.ts
  template-mappings.ts
scripts/
  smoke-test.js
  probe-templates.js
  probe-results.json
prisma/
  schema.prisma
  seed.js
types/
```
