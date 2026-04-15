from __future__ import annotations

import jwt

from app.core.auth import enforce_role, require_auth_context
from app.core.settings import settings


def test_require_auth_context_jwt_mode(monkeypatch):
    monkeypatch.setattr(settings, "auth_rbac_v2", True)
    monkeypatch.setattr(settings, "jwt_secret", "secret")
    monkeypatch.setattr(settings, "jwt_algorithm", "HS256")
    monkeypatch.setattr(settings, "jwt_issuer", "")
    monkeypatch.setattr(settings, "jwt_audience", "")

    token = jwt.encode({"sub": "alice", "role": "reviewer"}, "secret", algorithm="HS256")
    ctx = require_auth_context(authorization=f"Bearer {token}")
    assert ctx.subject == "alice"
    assert ctx.role == "reviewer"
    enforce_role(ctx, {"reviewer", "admin"})


def test_require_auth_context_accepts_legacy_api_key_header_when_rbac_enabled(monkeypatch):
    monkeypatch.setattr(settings, "auth_rbac_v2", True)
    monkeypatch.setattr(settings, "require_api_key", True)
    monkeypatch.setattr(settings, "api_key", "test-api-key")
    monkeypatch.setattr(settings, "jwt_secret", "")

    ctx = require_auth_context(x_api_key="test-api-key")
    assert ctx.subject == "apikey_user"
    assert ctx.role == "admin"


def test_require_auth_context_accepts_legacy_bearer_api_key_when_rbac_enabled(monkeypatch):
    monkeypatch.setattr(settings, "auth_rbac_v2", True)
    monkeypatch.setattr(settings, "require_api_key", True)
    monkeypatch.setattr(settings, "api_key", "test-api-key")
    monkeypatch.setattr(settings, "jwt_secret", "")

    ctx = require_auth_context(authorization="Bearer test-api-key")
    assert ctx.subject == "bearer_apikey_user"
    assert ctx.role == "admin"
