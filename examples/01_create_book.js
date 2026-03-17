/**
 * 예제 1: 책 생성 → 표지 → 내지 → 최종화
 *
 * 실행: node examples/01_create_book.js
 */

require('dotenv/config');
const { SweetbookClient } = require('../index');

const client = new SweetbookClient({
  apiKey: process.env.SWEETBOOK_API_KEY,
  environment: process.env.SWEETBOOK_ENV || 'sandbox',
});

async function main() {
  // 1. 책 생성
  console.log('책 생성 중...');
  const book = await client.books.create({
    bookSpecUid: 'SQUAREBOOK_HC',
    title: '테스트 포토북',
    creationType: 'TEST',
  });
  const bookUid = book.bookUid || book.uid;
  console.log('책 생성 완료:', bookUid);

  // 2. 표지 생성
  console.log('표지 생성 중...');
  const COVER_TEMPLATE_UID = 'YOUR_COVER_TEMPLATE_UID'; // 자신의 템플릿 UID로 교체
  await client.covers.create(bookUid, COVER_TEMPLATE_UID, {
    coverPhoto: 'https://picsum.photos/seed/cover/800/600',
    title: '테스트 포토북',
  });
  console.log('표지 완료');

  // 3. 내지 생성 (3페이지)
  const CONTENT_TEMPLATE_UID = 'YOUR_CONTENT_TEMPLATE_UID'; // 자신의 템플릿 UID로 교체
  for (let i = 1; i <= 3; i++) {
    console.log(`내지 ${i} 생성 중...`);
    await client.contents.insert(bookUid, CONTENT_TEMPLATE_UID, {
      photo: `https://picsum.photos/seed/page${i}/800/600`,
      text: `페이지 ${i} 내용`,
    }, { breakBefore: 'page' });
  }
  console.log('내지 완료');

  // 4. 최종화
  console.log('최종화 중...');
  const result = await client.books.finalize(bookUid);
  console.log('최종화 완료:', result);
}

main().catch(err => {
  console.error('오류:', err.message);
  if (err.details) console.error('상세:', err.details);
  process.exit(1);
});
