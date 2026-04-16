from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Header, HTTPException

from app.core.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class AuthContext:
    subject: str
    role: str
    raw: dict[str, Any]


def _header_value(value: str | None | object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _legacy_auth(x_api_key: str | None, authorization: str | None) -> AuthContext:
    api_key_header = _header_value(x_api_key)
    auth_header = _header_value(authorization)

    if not settings.require_api_key:
        return AuthContext(subject="anonymous", role="admin", raw={})
    if not settings.api_key:
        raise HTTPException(status_code=503, detail="API key auth required but API_KEY is not configured")
    if settings.api_key and secrets.compare_digest(api_key_header, settings.api_key):
        return AuthContext(subject="apikey_user", role="admin", raw={})
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if settings.api_key and secrets.compare_digest(token, settings.api_key):
            return AuthContext(subject="bearer_apikey_user", role="admin", raw={})
    raise HTTPException(status_code=401, detail="Unauthorized")


def require_auth_context(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> AuthContext:
    api_key_header = _header_value(x_api_key)
    auth_header = _header_value(authorization)

    if not settings.auth_rbac_v2:
        return _legacy_auth(api_key_header, auth_header)

    # Backward-compatible path: when clients still send API key credentials,
    # keep accepting them even if RBAC mode is enabled.
    has_legacy_credential = bool(api_key_header) or auth_header.lower().startswith("bearer ")
    if has_legacy_credential and settings.api_key:
        try:
            return _legacy_auth(api_key_header, auth_header)
        except HTTPException:
            # If a bearer token is present but is not the API key, continue to JWT validation.
            pass

    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = auth_header[7:].strip()
    if not settings.jwt_secret:
        raise HTTPException(status_code=503, detail="JWT auth enabled but JWT_SECRET is not configured")
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer or None,
            audience=settings.jwt_audience or None,
            options={"verify_aud": bool(settings.jwt_audience), "verify_iss": bool(settings.jwt_issuer)},
        )
    except Exception as exc:
        logger.warning("JWT validation failed", extra={"error_type": type(exc).__name__, "error": str(exc)})
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    subject = str(payload.get("sub") or payload.get("email") or "user")
    role = str(payload.get("role") or payload.get("roles") or "operator")
    return AuthContext(subject=subject, role=role, raw=dict(payload))


def enforce_role(auth: AuthContext, allowed_roles: set[str]) -> None:
    role = (auth.role or "").lower()
    if role not in {r.lower() for r in allowed_roles}:
        raise HTTPException(status_code=403, detail="Forbidden")
