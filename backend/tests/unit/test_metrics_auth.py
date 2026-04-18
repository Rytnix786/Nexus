"""Tests for metrics endpoint authentication and authorization.

Note: Metrics endpoint now uses optional_auth to support development environments
where authentication might not be fully configured. This allows the endpoint to
be accessed without strict authentication requirements while still respecting
provided credentials.
"""

import jwt
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.core.settings import settings


@pytest.fixture
def auth_enabled_client(client, monkeypatch):
    """Fixture that enables JWT auth for testing."""
    monkeypatch.setattr(settings, "auth_rbac_v2", True)
    monkeypatch.setattr(settings, "jwt_secret", "test-jwt-secret-key-32-bytes-min")
    monkeypatch.setattr(settings, "require_api_key", False)
    return client


def test_metrics_accessible_without_auth(auth_enabled_client):
    """Verify metrics endpoint is accessible without authentication (optional_auth)."""
    response = auth_enabled_client.get("/api/metrics")
    # With optional_auth, missing auth returns default operator role (200 OK)
    assert response.status_code == 200, "Metrics should be accessible without auth"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data"
    assert "total_cost_usd" in data, "Should include total cost"
    assert "avg_cost_per_run_usd" in data, "Should include average completed-run cost"
    assert "cost_by_provider" in data, "Should include provider cost breakdown"


def test_metrics_with_invalid_jwt(auth_enabled_client):
    """Verify metrics endpoint gracefully handles malformed JWT tokens."""
    # With optional_auth, malformed JWT falls back to default operator role
    response = auth_enabled_client.get(
        "/api/metrics",
        headers={"Authorization": "Bearer invalid.token.format"}
    )
    assert response.status_code == 200, "Metrics should handle invalid JWT gracefully"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data with default role"


def test_metrics_accepts_valid_admin_jwt(auth_enabled_client):
    """Verify metrics endpoint accepts admin role JWT."""
    token = jwt.encode(
        {"sub": "admin_user", "role": "admin"},
        "test-jwt-secret-key-32-bytes-min",
        algorithm="HS256"
    )
    response = auth_enabled_client.get(
        "/api/metrics",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, "Should accept admin role"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data"


def test_metrics_accepts_valid_operator_jwt(auth_enabled_client):
    """Verify metrics endpoint accepts operator role JWT."""
    token = jwt.encode(
        {"sub": "operator_user", "role": "operator"},
        "test-jwt-secret-key-32-bytes-min",
        algorithm="HS256"
    )
    response = auth_enabled_client.get(
        "/api/metrics",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, "Should accept operator role"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data"


def test_metrics_accepts_valid_reviewer_jwt(auth_enabled_client):
    """Verify metrics endpoint accepts reviewer role JWT."""
    token = jwt.encode(
        {"sub": "reviewer_user", "role": "reviewer"},
        "test-jwt-secret-key-32-bytes-min",
        algorithm="HS256"
    )
    response = auth_enabled_client.get(
        "/api/metrics",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, "Should accept reviewer role with optional auth"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data"


def test_metrics_with_mismatched_jwt_secret(client, monkeypatch):
    """Verify metrics endpoint handles JWT with wrong secret gracefully."""
    monkeypatch.setattr(settings, "auth_rbac_v2", True)
    monkeypatch.setattr(settings, "jwt_secret", "correct-jwt-secret-32-bytes-min")
    monkeypatch.setattr(settings, "require_api_key", False)
    
    # JWT signed with different secret - falls back to default operator role
    token = jwt.encode(
        {"sub": "user", "role": "admin"},
        "wrong-jwt-secret-32-bytes-min",
        algorithm="HS256"
    )
    response = client.get(
        "/api/metrics",
        headers={"Authorization": f"Bearer {token}"}
    )
    # With optional_auth, signature mismatch falls back to default operator role
    assert response.status_code == 200, "Metrics should handle invalid signature gracefully"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data with default role"


def test_metrics_with_expired_jwt(client, monkeypatch):
    """Verify metrics endpoint handles expired JWT gracefully."""
    from datetime import datetime, timedelta, timezone
    
    monkeypatch.setattr(settings, "auth_rbac_v2", True)
    monkeypatch.setattr(settings, "jwt_secret", "test-jwt-secret-key-32-bytes-min")
    monkeypatch.setattr(settings, "require_api_key", False)
    
    # JWT that expired 1 hour ago - falls back to default operator role
    past_time = datetime.now(timezone.utc) - timedelta(hours=1)
    token = jwt.encode(
        {"sub": "user", "role": "admin", "exp": past_time},
        "test-jwt-secret-key-32-bytes-min",
        algorithm="HS256"
    )
    response = client.get(
        "/api/metrics",
        headers={"Authorization": f"Bearer {token}"}
    )
    # With optional_auth, expired token falls back to default operator role
    assert response.status_code == 200, "Metrics should handle expired token gracefully"
    data = response.json()
    assert "total_runs" in data, "Should return metrics data with default role"
