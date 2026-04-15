from __future__ import annotations

import time
from typing import Any

import redis

from app.core.logging import get_logger


logger = get_logger(__name__)


class RedisRateLimiter:
    def __init__(self, redis_url: str, limit_per_minute: int) -> None:
        self.redis_url = redis_url
        self.limit_per_minute = limit_per_minute
        self.client = redis.Redis.from_url(redis_url)
        self.fail_open_count = 0
        self.consecutive_fail_open_count = 0
        self.last_fail_open_error = ""

    def check(self, key: str) -> bool:
        window_minute = int(time.time() // 60)
        redis_key = f"nexus:rl:{key}:{window_minute}"

        try:
            pipe = self.client.pipeline()
            pipe.incr(redis_key)
            pipe.expire(redis_key, 120, nx=True)
            count, _ = pipe.execute()
            self.consecutive_fail_open_count = 0
            self.last_fail_open_error = ""
            return int(count) <= self.limit_per_minute
        except redis.RedisError as exc:
            self.fail_open_count += 1
            self.consecutive_fail_open_count += 1
            self.last_fail_open_error = str(exc)
            logger.warning(
                "Redis rate limiter unavailable; allowing request",
                extra={"key": key, "error": str(exc)},
            )
            return True

    def is_available(self) -> bool:
        try:
            return bool(self.client.ping())
        except redis.RedisError:
            return False

    def close(self) -> None:
        try:
            self.client.close()
        except redis.RedisError:
            return

    def stats(self) -> dict[str, int | str]:
        return {
            "fail_open_count": self.fail_open_count,
            "consecutive_fail_open_count": self.consecutive_fail_open_count,
            "last_fail_open_error": self.last_fail_open_error,
        }


class NoopRateLimiter:
    def check(self, key: str) -> bool:
        return True

    def is_available(self) -> bool:
        return True

    def close(self) -> None:
        return

    def stats(self) -> dict[str, int | str]:
        return {
            "fail_open_count": 0,
            "consecutive_fail_open_count": 0,
            "last_fail_open_error": "",
        }


def create_rate_limiter(app_settings: Any) -> RedisRateLimiter | NoopRateLimiter:
    if not getattr(app_settings, "rate_limit_enabled", True):
        return NoopRateLimiter()
    return RedisRateLimiter(
        redis_url=str(getattr(app_settings, "redis_url", "redis://localhost:6379/0")),
        limit_per_minute=int(getattr(app_settings, "run_requests_per_minute", 30)),
    )
