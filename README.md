# bookprintapi-nodejs-sdk

Sweetbook API를 Node.js에서 사용하기 위한 SDK입니다.

## 빠른 시작

```bash
npm install
cp .env.example .env   # API Key 편집
```

```javascript
const { SweetbookClient } = require('bookprintapi-nodejs-sdk');

const client = new SweetbookClient({
  apiKey: 'SB_YOUR_API_KEY',
  environment: 'sandbox',  // 'sandbox' | 'live'
});

// 책 생성
const book = await client.books.create({
  bookSpecUid: 'SQUAREBOOK_HC',
  title: '내 포토북',
  creationType: 'TEST',
});
console.log('bookUid:', book.bookUid);
```

> Node.js 18 이상 필요 (내장 `fetch` 사용)

## SDK 구조

```
lib/
├── core.js      # 에러 클래스, ResponseParser, BaseClient (HTTP, 재시도, 타임아웃)
├── client.js    # SweetbookClient + 리소스별 클라이언트
└── webhook.js   # 웹훅 서명 검증 유틸
index.js         # 진입점
```

## 리소스

| 리소스 | 메서드 | 설명 |
|--------|--------|------|
| `client.books` | `list`, `create`, `get`, `finalize`, `delete` | 책 관리 |
| `client.photos` | `upload`, `list`, `delete` | 사진 업로드/관리 |
| `client.covers` | `create`, `get`, `delete` | 표지 |
| `client.contents` | `insert`, `clear` | 내지 페이지 |
| `client.orders` | `estimate`, `create`, `list`, `get`, `cancel`, `updateShipping` | 주문 |
| `client.credits` | `getBalance`, `transactions`, `sandboxCharge` | 충전금 |

## 예제

### 1. 책 생성 → 표지 → 내지 → 최종화

```bash
node examples/01_create_book.js
```

### 2. 충전금 확인 → 견적 → 주문

```bash
node examples/02_order.js
```

### 3. 웹훅 수신 서버

```bash
node examples/03_webhook_server.js
```

## 환경 설정

`.env` 파일 또는 환경변수로 설정:

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `SWEETBOOK_API_KEY` | API 키 | (필수) |
| `SWEETBOOK_ENV` | `sandbox` 또는 `live` | `live` |
| `SWEETBOOK_WEBHOOK_SECRET` | 웹훅 시크릿 | (선택) |

## SDK 옵션

```javascript
const client = new SweetbookClient({
  apiKey: 'SB...',           // 필수
  environment: 'sandbox',    // 'sandbox' | 'live' (기본: 'live')
  baseUrl: 'https://...',    // 직접 지정 (environment 대신)
  timeout: 30000,            // 요청 타임아웃 ms (기본: 30초)
});
```

## 에러 처리

```javascript
const { SweetbookApiError, SweetbookNetworkError } = require('bookprintapi-nodejs-sdk');

try {
  await client.books.get('invalid-uid');
} catch (err) {
  if (err instanceof SweetbookApiError) {
    console.log('API 에러:', err.statusCode, err.message);
    console.log('상세:', err.details);
  } else if (err instanceof SweetbookNetworkError) {
    console.log('네트워크 에러:', err.message);
  }
}
```

## 웹훅 서명 검증

```javascript
const { verifySignature } = require('bookprintapi-nodejs-sdk');

// Express 예시
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const payload = req.body.toString();
  const signature = req.headers['x-sweetbook-signature'];
  const timestamp = req.headers['x-sweetbook-timestamp'];

  if (!verifySignature(payload, signature, WEBHOOK_SECRET, timestamp)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(payload);
  // 이벤트 처리...
  res.json({ received: true });
});
```

## 자동 재시도

429 (Rate Limit) 및 5xx 에러 시 지수 백오프로 최대 2회 재시도합니다.

| 시도 | 대기 시간 |
|------|----------|
| 1차 재시도 | 1초 |
| 2차 재시도 | 2초 |

## 커스터마이징

| 파일 | 수정 내용 |
|------|----------|
| `lib/client.js` | 리소스 클라이언트 추가/수정 |
| `lib/core.js` | HTTP 클라이언트 동작 변경 (재시도, 타임아웃 등) |
| `lib/webhook.js` | 서명 검증 로직 수정 |
| `examples/` | 자신의 템플릿 UID와 데이터로 예제 수정 |

## 라이선스

MIT
