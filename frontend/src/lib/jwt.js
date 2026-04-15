function base64UrlToBase64(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding === 0) return normalized;
  return normalized + '='.repeat(4 - padding);
}

function decodeBase64Json(segment) {
  if (!segment) return null;
  try {
    const text = atob(base64UrlToBase64(segment));
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) return null;
  return decodeBase64Json(parts[1]);
}

export function isJwtExpired(payload, now = Date.now()) {
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp * 1000 <= now;
}

export function isJwtLikeToken(token) {
  return String(token || '').trim().split('.').length === 3;
}