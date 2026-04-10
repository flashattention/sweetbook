# Dreamcatcher (Sweetbook Book Print API 과제)

스위트북 Book Print API를 활용해, 사용자가 사진/스토리를 책으로 제작하고 주문까지 할 수 있는 웹 애플리케이션입니다.

## 1. 서비스 소개

### 한 문장 소개
사용자가 포토북/만화책/소설 프로젝트를 만들고 실제 책 주문까지 연결하는 AI 기반 북 제작 서비스입니다.

### 타겟 고객
- 아이 성장기/가족 추억을 책으로 남기고 싶은 개인 사용자
- 사진/글을 소량 출판하고 싶은 1인 창작자
- 유치원/학원/동아리처럼 기록물을 책 형태로 남기고 싶은 그룹

### 주요 기능
- 포토북 편집: 이미지/템플릿/추가입력 편집 후 출판
- AI 만화 생성: 스토리+이미지 자동 생성 후 출판/주문
- AI 소설 생성: 아웃라인+페이지 본문 자동 생성 후 출판/주문
- 주문/배송 상태 조회: 주문 생성, 상태 확인, 프로젝트 보기
- 계정 기반 데이터 분리: 회원가입/로그인/세션 인증
- 신규 가입 시 기본 샘플 프로젝트 3개 자동 제공

## 2. 실행 방법

README만 보고 그대로 실행 가능한 순서입니다.

### 2-1. 저장소 준비
```bash
git clone <YOUR_REPOSITORY_URL>
cd sweetbook
```

### 2-2. 설치
```bash
npm install
```

### 2-3. 환경변수 설정
```bash
cp .env.example .env
```

`.env` 파일을 열어 최소 아래 항목을 설정하세요.

```env
# Sweetbook Book Print API
SWEETBOOK_API_KEY=SB_YOUR_API_KEY
SWEETBOOK_ENV=sandbox
SWEETBOOK_WEBHOOK_SECRET=your_webhook_secret

# Database
DATABASE_URL="file:./dev.db"

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Auth
AUTH_SECRET=replace_with_random_secret_min_16_chars
```

추가 참고:
- `.env.example`에 전체 예시 키가 포함되어 있습니다.
- `SWEETBOOK_API_KEY`가 없으면 일부 기능은 데모 모드로 동작합니다.

### 2-4. DB 초기화(더미 데이터 포함)
```bash
npm run db:setup
```

### 2-5. 실행
```bash
npm run dev
```

브라우저에서 확인:
- http://localhost:3000

### 2-6. 바로 로그인 가능한 테스트 계정

`npm run db:setup` 실행 후 아래 계정으로 즉시 로그인할 수 있습니다.

- 이메일: `a@a.a`
- 비밀번호: `Test1234!`

해당 계정에는 기본 샘플 프로젝트 3개가 포함되어 있어, 메인 페이지에서 바로 확인하고 주문 흐름까지 테스트할 수 있습니다.

추가로, DRAFT 샘플 1개는 `SQUAREBOOK_HC` 최소 조건(24페이지)을 충족하도록 시드되어 있어 바로 발행 테스트가 가능합니다.

### 2-7. README 기준 즉시 검증 시나리오 (Clone 직후)

아래 순서만 따라하면 로그인부터 발행/주문 화면 진입까지 확인할 수 있습니다.

1. `npm run db:setup`
2. `npm run dev`
3. 브라우저에서 `http://localhost:3000/login` 접속 후 테스트 계정(`a@a.a` / `Test1234!`) 로그인
4. 메인 프로젝트 목록에서 DRAFT 상태 프로젝트(`우리의 첫 번째 이야기`) 선택
5. 편집 화면에서 `출판하기` 실행
6. 성공 시 프로젝트 상태가 `PUBLISHED`로 변경되고 주문 페이지 진입 가능

참고:
- `SWEETBOOK_API_KEY`가 설정된 경우 실제 샌드박스 Book UID로 발행됩니다.
- 키가 없거나 외부 API 상태가 불안정하면 발행/주문 단계에서 실패할 수 있습니다.

## 3. 사용한 API 목록 (Book Print API)

아래는 이 서비스에서 실제 사용하는 Book Print API 연동 목록입니다.

| API/SDK 기능 | 용도 |
| --- | --- |
| `books.create` | 출판 시작 시 Book 생성 |
| `covers.create` 또는 `/Books/{bookUid}/cover` | 표지 템플릿 적용 |
| `contents.insert` 또는 `/Books/{bookUid}/contents` | 내지 페이지 템플릿 삽입 |
| `books.finalize` | 책 제작 완료(출판 완료 처리) |
| `orders.estimate` | 주문 전 실시간 견적 조회 |
| `orders.create` | 주문 생성 |
| `orders.get` | 주문 상태 조회 |
| `GET /templates` | 템플릿 목록 조회 |
| `GET /templates/{templateUid}` | 템플릿 상세/필수 입력값 조회 |
| `GET /book-specs` (서비스 라우트) | 판형 목록 조회에 활용 |

서비스 내부 라우트 예시:
- `POST /api/projects/[id]/publish`
- `POST /api/orders/estimate`
- `POST /api/orders`

## 4. AI 도구 사용 내역

| AI 도구 | 활용 내용 |
| --- | --- |
| GitHub Copilot Chat | 라우트/상태흐름/템플릿 처리 로직 구현 및 리팩터링 |
| OpenAI API (`gpt-4o-mini`, `gpt-4.1-mini`) | 만화/소설 텍스트 생성 |
| OpenAI 이미지 모델 (`gpt-image-1`, `dall-e-2`) | 표지/페이지 이미지 생성 |

## 5. 설계 의도

### 왜 이 서비스를 선택했는가
- 단순 CRUD가 아닌, 실제 사용자 가치(책 제작/주문)까지 이어지는 end-to-end 제품 흐름을 보여주기 위해 선택했습니다.
- Book Print API의 핵심 가치(콘텐츠를 실물 책으로 전환)를 가장 직관적으로 드러낼 수 있는 도메인이기 때문입니다.

### 비즈니스 가능성
- 개인 추억 기록 시장(육아/여행/기념일)은 반복 구매 가능성이 높습니다.
- AI 생성형 콘텐츠(만화/소설)와 결합하면 사용자 제작 장벽을 크게 낮출 수 있습니다.
- 템플릿 기반 제작으로 운영 자동화가 가능해 B2C/B2B(교육기관, 소모임) 확장성이 있습니다.

### 더 시간이 있었다면 추가할 기능
- 템플릿 호환성 사전 검증 UI 강화(필수 입력값 자동 추천)
- 팀/가족 공동 편집 및 코멘트 협업 기능
- 장바구니/복수 권수 할인/쿠폰 정책
- 출판 실패 자동 복구 워크플로우 고도화
- 관리자 대시보드(주문/에러/사용량 분석)

## 6. 과제 요구사항 체크리스트

- [x] 최종 사용자 프론트엔드 UI 제공
- [x] 백엔드에서 API Key 관리 및 Book Print API 통신
- [x] Books API + Orders API 사용
- [x] 더미 데이터 포함(실행 직후 확인 가능)
- [x] `.env.example` 제공 및 키 하드코딩/커밋 방지
- [x] 로컬 실행 절차 명시

## 7. 기술 스택

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite
- Tailwind CSS
- OpenAI API
- Sweetbook Book Print API

## 8. 주요 스크립트

```bash
npm run dev
npm run build
npm run start
npm run db:setup
npm run db:seed
npm run db:reset
npm run smoke-test
npm run probe-templates
```

## 9. 디렉터리 개요

```text
app/
  api/
  create/
  editor/
  order/
  status/
  view/
lib/
prisma/
scripts/
public/
```

## 10. 보안 유의사항

- 실제 API Key가 들어간 `.env`는 절대 커밋하지 마세요.
- 공개 저장소에는 `.env.example`만 포함하세요.
- 프로덕션에서는 반드시 강한 `AUTH_SECRET`을 사용하세요.
