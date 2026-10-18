import { createHash, timingSafeEqual } from 'node:crypto';
export function validFeedToken(header, expected) {
  if (!expected || expected.length < 64 || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(expected));
}
