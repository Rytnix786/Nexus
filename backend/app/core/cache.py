"""Semantic caching layer for LLM responses.

Simple in-memory cache indexed by hash(query + top_context).
Stores LLM responses to avoid redundant generations.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Module-level in-memory cache: {cache_key: response}
_response_cache: dict[str, str] = {}


def _make_cache_key(query: str, top_context: str) -> str:
    """Generate cache key from query and top context.
    
    Args:
        query: Search query or objective string
        top_context: Top retrieved context snippet or uploaded context
    
    Returns:
        Hex hash of combined strings
    """
    combined = f"{query.strip()}|{top_context.strip()}"
    return hashlib.sha256(combined.encode()).hexdigest()


def get_cached_response(query: str, top_context: str) -> str | None:
    """Check cache for existing response.
    
    Args:
        query: Search query or objective string
        top_context: Top retrieved context or user-uploaded context
    
    Returns:
        Cached response string if hit, None if miss
    """
    cache_key = _make_cache_key(query, top_context)
    cached = _response_cache.get(cache_key)
    
    if cached:
        logger.debug(
            "Cache hit",
            extra={"cache_key": cache_key[:16], "value_length": len(cached), "total_cached": len(_response_cache)}
        )
        return cached
    
    logger.debug(
        "Cache miss",
        extra={"cache_key": cache_key[:16], "total_cached": len(_response_cache)}
    )
    return None


def save_response_to_cache(query: str, top_context: str, response: str) -> None:
    """Save LLM response to cache.
    
    Args:
        query: Search query or objective string
        top_context: Top retrieved context or user-uploaded context
        response: LLM-generated response text
    """
    cache_key = _make_cache_key(query, top_context)
    _response_cache[cache_key] = response
    
    logger.debug(
        "Cached response",
        extra={"cache_key": cache_key[:16], "value_length": len(response), "total_cached": len(_response_cache)}
    )


def clear_cache() -> None:
    """Clear all cached responses. Useful for testing."""
    global _response_cache
    _response_cache.clear()
    logger.debug("Cache cleared")


def get_cache_stats() -> dict[str, Any]:
    """Return cache statistics."""
    return {
        "total_entries": len(_response_cache),
        "approx_size_kb": sum(len(v) for v in _response_cache.values()) // 1024,
    }
