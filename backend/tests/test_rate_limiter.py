from __future__ import annotations

import redis

import app.api.routes as api_routes
from app.core.rate_limiter import NoopRateLimiter, RedisRateLimiter, create_rate_limiter


class _Pipeline:
    def __init__(self, client):
        self.client = client
        self.calls = []

    def incr(self, key: str):
        self.calls.append(("incr", key))
        return self

    def expire(self, key: str, ttl: int, nx: bool = False):
        self.calls.append(("expire", key, ttl, nx))
        return self

    def execute(self):
        self.client.count += 1
        return [self.client.count, True]


class _FakeRedis:
    def __init__(self):
        self.count = 0

    def pipeline(self):
        return _Pipeline(self)

    def ping(self) -> bool:
        return True

    def close(self):
        return None


class _ErrorRedis:
    def pipeline(self):
        raise redis.RedisError("boom")

    def ping(self) -> bool:
        raise redis.RedisError("boom")

    def close(self):
        return None


def test_noop_limiter_always_passes():
    limiter = NoopRateLimiter()
    assert limiter.check("any") is True


def test_redis_limiter_allows_within_limit(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(redis.Redis, "from_url", lambda _url: fake)

    limiter = RedisRateLimiter("redis://test", limit_per_minute=3)
    assert limiter.check("client") is True
    assert limiter.check("client") is True
    assert limiter.check("client") is True


def test_redis_limiter_blocks_over_limit(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(redis.Redis, "from_url", lambda _url: fake)

    limiter = RedisRateLimiter("redis://test", limit_per_minute=2)
    assert limiter.check("client") is True
    assert limiter.check("client") is True
    assert limiter.check("client") is False


def test_redis_limiter_fails_open_on_error(monkeypatch):
    monkeypatch.setattr(redis.Redis, "from_url", lambda _url: _ErrorRedis())

    limiter = RedisRateLimiter("redis://test", limit_per_minute=1)
    assert limiter.check("client") is True
    stats = limiter.stats()
    assert stats["fail_open_count"] == 1
    assert stats["consecutive_fail_open_count"] == 1
    assert stats["last_fail_open_error"]


def test_health_ratelimit_endpoint(client):
    response = client.get("/api/health/ratelimit")
    assert response.status_code == 200
    payload = response.json()
    assert "redis_available" in payload
    assert "limit_per_minute" in payload
    assert "fail_open_count" in payload
    assert "consecutive_fail_open_count" in payload
    assert "last_fail_open_error" in payload


def test_rate_limit_enabled_false_skips_redis(monkeypatch):
    class _Settings:
        redis_url = "redis://redis:6379/0"
        run_requests_per_minute = 5
        rate_limit_enabled = False

    limiter = create_rate_limiter(_Settings())
    assert isinstance(limiter, NoopRateLimiter)
