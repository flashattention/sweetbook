# Momento Photobook App

Next.js 14 기반 커플 포토북 제작/주문 웹앱입니다.  
프로젝트 생성 → 편집 → Sweetbook 발행 → 주문 → 배송조회 흐름을 제공합니다.

## 서비스 소개

- 한 줄 소개: 커플이 사진과 문구를 업로드해 실물 포토북으로 제작하고 주문까지 완료할 수 있는 웹앱입니다.
- 타겟 고객: 기념일을 기록하고 선물하고 싶은 20~30대 커플, 소규모 가족/지인 중심 포토북 수요 사용자
- 주요 기능:
  - 신규 프로젝트 생성(기념일/이름 기반)
  - 표지/내지 편집(이미지 업로드 + 캡션 작성)
  - Sweetbook Book Print API로 출판(publish)
  - 주문 견적 조회 및 주문 생성
  - 주문 상태/배송 정보 조회

## 기술 스택

- Next.js 14 (App Router)
- TypeScript
- Prisma + SQLite
- Tailwind CSS
- Sweetbook API (Sandbox/Live)

## 빠른 실행

### 1) 설치

```bash
npm install
```

### 2) 환경 변수 설정

```bash
cp .env.example .env
```

.env에서 최소 아래 항목을 설정합니다.

```env
SWEETBOOK_API_KEY=SB_YOUR_API_KEY
SWEETBOOK_ENV=sandbox
SWEETBOOK_WEBHOOK_SECRET=your_webhook_secret

# Template UID (직접 교체)
# 검증된 Sandbox 예시 (SQUAREBOOK_HC):
#   COVER   = 39kySqmyRhhs
#   CONTENT = 46VqZhVNOfAp
#
# 주의:
# - SQUAREBOOK_HC는 finalize 최소 24페이지 필요
# - 템플릿 UID를 변경하면 publish 파라미터 매핑도 함께 확인 필요
SWEETBOOK_COVER_TEMPLATE_UID=YOUR_COVER_TEMPLATE_UID
SWEETBOOK_CONTENT_TEMPLATE_UID=YOUR_CONTENT_TEMPLATE_UID
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

브라우저: http://localhost:3000

## 핵심 화면

- 홈: 프로젝트 목록/생성 진입
- 생성: 커플 정보로 신규 프로젝트 생성
- 편집: 표지/내지 이미지 업로드 및 캡션 입력
- 주문: 견적 조회 및 배송 정보 입력
- 상태: 주문 상태 및 운송장 조회

## API 라우트 요약

- 프로젝트
  - GET /api/projects
  - POST /api/projects
  - GET/PATCH/DELETE /api/projects/:id
- 페이지
  - GET/POST /api/projects/:id/pages
  - PATCH/DELETE /api/projects/:id/pages/:pageId
  - POST /api/projects/:id/pages/reorder
- 발행
  - POST /api/projects/:id/publish
- 템플릿/스펙
  - GET /api/templates
  - GET /api/book-specs
- 주문
  - POST /api/orders/estimate
  - POST /api/orders
  - GET /api/orders
  - GET /api/orders/:orderUid
- 웹훅
  - POST /api/webhook

## 사용한 Book Print API 목록

아래는 본 프로젝트에서 실제 사용한 Sweetbook Book Print API 엔드포인트입니다.

| API | 용도 |
|---|---|
| POST /Books | 새 포토북 생성 |
| POST /Books/{bookUid}/cover | 표지 템플릿 적용 및 표지 이미지 업로드 |
| POST /Books/{bookUid}/contents?breakBefore=page | 내지 페이지(템플릿 + 이미지 + 텍스트) 추가 |
| POST /Books/{bookUid}/finalization | 포토북 최종 확정 |
| POST /Orders/estimate | 주문 전 금액 견적 조회 |
| POST /Orders | 주문 생성 |
| GET /Orders/{orderUid} | 주문 상태/배송 정보 조회 |
| GET /Templates | 템플릿 목록 조회(UID 확인용) |
| GET /Book-specs | 판형 목록 조회(검증/확장용) |

참고: 앱 내부에서는 위 외부 API를 서버 라우트로 감싼 뒤 호출합니다.

## AI 도구 사용 내역

| AI 도구 | 활용 내용 |
|---|---|
| GitHub Copilot (VS Code) | API 라우트/타입 보강, 에러 핸들링 및 리팩터링 보조 |
| ChatGPT | README 구조 개선, 제출 문항 초안 정리, 검증 체크리스트 작성 |
| 생성형 AI 이미지(샘플) | 시연용 더미 이미지 seed 아이디어 정리 |

핵심 원칙:
- 비즈니스 로직/최종 의사결정은 직접 수행
- AI 출력 코드는 실행/테스트 후 수동 검증
- 민감정보(API Key)는 프롬프트 입력/커밋 금지

## 설계 의도

### 1) 왜 이 서비스를 선택했는가

과제 목표인 "콘텐츠를 책으로 만드는 경험"을 가장 직관적으로 보여줄 수 있는 시나리오가 커플 기념일 포토북이라고 판단했습니다. 사용자 입력(사진/문구)에서 출판/주문까지 이어지는 end-to-end 플로우를 명확히 검증할 수 있습니다.

### 2) 비즈니스 가능성

- 기념일/선물 수요는 반복성이 높아 재구매 가능성이 큼
- 테마 템플릿 확장(생일, 여행, 반려동물, 육아)으로 동일 엔진 재사용 가능
- B2C 외에도 소규모 스튜디오/학원/유치원 대상 B2B 확장 여지 존재

### 3) 더 시간이 있었다면 추가할 기능

- 자동 레이아웃 추천(이미지 비율 기반)
- 템플릿 미리보기/선택 UI 고도화
- 결제/쿠폰/장바구니 지원
- 웹훅 기반 비동기 상태 동기화 고도화
- 업로드 이미지 최적화 및 실패 복구 재시도 큐

## Sandbox 검증 기준

이 저장소는 실제 Sandbox 연동 검증을 완료했습니다.

- 템플릿 조회 성공
- 발행 성공
- 주문 견적 성공
- Sandbox 충전 성공
- 주문 생성/조회 성공

검증 중 확인된 제약사항:

- SQUAREBOOK_HC는 finalization 시 최소 24페이지 필요
- 템플릿 파일 바인딩은 공통 files 필드가 아니라 실제 파라미터 키명으로 전송 필요
- 현재 publish 구현은 검증된 템플릿 파라미터 스키마(coverPhoto/photo 계열)에 맞춰져 있음
- 템플릿 UID를 다른 세트로 바꿀 경우, publish 라우트의 parameters 매핑도 함께 조정 필요

## 운영 팁

- API 키 미설정 시 일부 라우트는 Demo 모드로 동작합니다.
- Sweetbook 연동 실패 시 먼저 GET /api/templates, GET /api/book-specs로 인증/환경을 점검하세요.
- 주문이 실패하면 /api/orders/estimate 응답의 creditSufficient를 확인하세요.

## 프로젝트 구조

```text
app/
  api/
  create/
  editor/
  order/
  status/
lib/
  prisma.ts
  sweetbook-api.ts
prisma/
  schema.prisma
  seed.js
types/
```
