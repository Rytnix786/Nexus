import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, isJwtExpired, isJwtLikeToken } from './jwt';

function encodeBase64Url(value) {
  return btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

describe('JWT helpers', () => {
  it('decodes a valid JWT payload', () => {
    const token = [
      encodeBase64Url({ alg: 'HS256', typ: 'JWT' }),
      encodeBase64Url({ sub: 'user-123', exp: 2_000_000_000 }),
      encodeBase64Url({ signature: true }),
    ].join('.');

    expect(isJwtLikeToken(token)).toBe(true);
    expect(decodeJwtPayload(token)).toMatchObject({ sub: 'user-123', exp: 2_000_000_000 });
  });

  it('returns null for malformed JWTs', () => {
    expect(isJwtLikeToken('not-a-token')).toBe(false);
    expect(decodeJwtPayload('not-a-token')).toBeNull();
  });

  it('detects expiry from the exp claim', () => {
    expect(isJwtExpired({ exp: 1 }, 2_000)).toBe(true);
    expect(isJwtExpired({ exp: 9_999_999_999 }, 2_000)).toBe(false);
    expect(isJwtExpired({}, 2_000)).toBe(false);
  });
});