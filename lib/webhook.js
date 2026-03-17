/**
 * Sweetbook Webhook — 서명 검증 유틸리티
 *
 * Usage:
 *   const { verifySignature } = require('./lib/webhook');
 *
 *   const isValid = verifySignature(rawBody, signature, secret, timestamp);
 */

const crypto = require('crypto');

/**
 * 웹훅 서명을 검증합니다.
 *
 * @param {string} payload - 요청 본문 (raw string)
 * @param {string} signature - X-Sweetbook-Signature 헤더 값
 * @param {string} secret - 웹훅 시크릿 키
 * @param {string} [timestamp] - X-Sweetbook-Timestamp 헤더 값
 * @param {number} [tolerance=300] - 타임스탬프 허용 오차 (초, 기본 5분)
 * @returns {boolean}
 */
function verifySignature(payload, signature, secret, timestamp, tolerance = 300) {
  if (!payload || !signature || !secret) return false;

  // 타임스탬프 검증
  if (timestamp) {
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) {
      return false;
    }
  }

  // HMAC-SHA256 서명 검증
  const signedContent = timestamp ? `${timestamp}.${payload}` : payload;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

module.exports = { verifySignature };
