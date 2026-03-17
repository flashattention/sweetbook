/**
 * 예제 2: 충전금 확인 → 견적 → 주문 생성
 *
 * 실행: node examples/02_order.js
 */

require('dotenv/config');
const { SweetbookClient } = require('../index');

const client = new SweetbookClient({
  apiKey: process.env.SWEETBOOK_API_KEY,
  environment: process.env.SWEETBOOK_ENV || 'sandbox',
});

async function main() {
  // 1. 충전금 잔액 확인
  const balance = await client.credits.getBalance();
  console.log('충전금 잔액:', balance.balance, '원');

  // Sandbox 충전 (테스트용)
  if (balance.balance < 50000) {
    console.log('Sandbox 충전 중...');
    await client.credits.sandboxCharge(100000, 'SDK 테스트 충전');
    const updated = await client.credits.getBalance();
    console.log('충전 후 잔액:', updated.balance, '원');
  }

  // 2. FINALIZED 책 목록 조회
  const books = await client.books.list({ status: 'finalized' });
  const bookList = books.data || [];
  if (bookList.length === 0) {
    console.log('FINALIZED 상태 책이 없습니다. 먼저 01_create_book.js를 실행하세요.');
    return;
  }
  const bookUid = bookList[0].bookUid || bookList[0].uid;
  console.log('주문할 책:', bookUid);

  // 3. 견적 조회
  const estimate = await client.orders.estimate({
    items: [{ bookUid, quantity: 1 }],
  });
  console.log('견적:', estimate);

  // 4. 주문 생성
  const order = await client.orders.create({
    items: [{ bookUid, quantity: 1 }],
    shipping: {
      recipientName: '홍길동',
      recipientPhone: '010-1234-5678',
      postalCode: '06100',
      address1: '서울특별시 강남구 테헤란로 123',
      address2: '4층',
      shippingMemo: '부재 시 경비실',
    },
    externalRef: 'SDK-TEST-001',
  });
  console.log('주문 완료:', order.orderUid);

  // 5. 주문 상세 조회
  const detail = await client.orders.get(order.orderUid);
  console.log('주문 상태:', detail.status);
}

main().catch(err => {
  console.error('오류:', err.message);
  if (err.details) console.error('상세:', err.details);
  process.exit(1);
});
