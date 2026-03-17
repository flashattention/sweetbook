/**
 * 예제 3: 웹훅 수신 서버
 *
 * 실행: node examples/03_webhook_server.js
 * 테스트: curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"event":"order.shipped"}'
 */

require('dotenv/config');
const http = require('http');
const { verifySignature } = require('../index');

const PORT = process.env.WEBHOOK_PORT || 3000;
const SECRET = process.env.SWEETBOOK_WEBHOOK_SECRET || '';

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const signature = req.headers['x-sweetbook-signature'] || '';
      const timestamp = req.headers['x-sweetbook-timestamp'] || '';

      // 서명 검증 (시크릿이 설정된 경우)
      if (SECRET && !verifySignature(body, signature, SECRET, timestamp)) {
        console.log('[webhook] 서명 검증 실패');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }

      // 이벤트 처리
      try {
        const event = JSON.parse(body);
        console.log(`[webhook] 이벤트 수신: ${event.event || 'unknown'}`);
        console.log(JSON.stringify(event, null, 2));

        // 이벤트별 처리
        switch (event.event) {
          case 'order.paid':
            console.log(`  → 주문 결제 완료: ${event.data?.orderUid}`);
            break;
          case 'order.shipped':
            console.log(`  → 발송 완료: ${event.data?.orderUid}, 송장: ${event.data?.trackingNumber}`);
            break;
          case 'order.delivered':
            console.log(`  → 배송 완료: ${event.data?.orderUid}`);
            break;
          case 'order.cancelled':
            console.log(`  → 주문 취소: ${event.data?.orderUid}`);
            break;
          default:
            console.log(`  → 알 수 없는 이벤트: ${event.event}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      } catch (err) {
        console.error('[webhook] JSON 파싱 오류:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`웹훅 서버 시작: http://localhost:${PORT}/webhook`);
  if (!SECRET) console.log('주의: SWEETBOOK_WEBHOOK_SECRET이 설정되지 않아 서명 검증을 건너뜁니다.');
});
