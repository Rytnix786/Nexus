from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from rank_bm25 import BM25Okapi

from app.core.tracing import safe_trace_span
from app.core.settings import settings

logger = logging.getLogger(__name__)

# Module-level cache for cross-encoder model (lazy load).
_cross_encoder_model: Any | None = None


def _placeholder_web_search(query: str) -> dict[str, Any]:
    return {
        "query": query,
        "web_search_used": False,
        "source": "placeholder",
        "results": [
            {"title": "Nexus architecture notes", "url": "https://example.com/nexus-architecture"},
            {"title": "LangGraph checkpointing patterns", "url": "https://example.com/langgraph-checkpointing"},
        ],
    }


def web_search(query: str) -> dict[str, Any]:
    clean_query = query.strip()
    with safe_trace_span("tool.web_search", {"query_length": len(clean_query)}):
        if not clean_query:
            return {
                "query": "",
                "web_search_used": False,
                "source": "placeholder",
                "results": [],
            }

        if not settings.web_search_enabled or not settings.tavily_api_key:
            return _placeholder_web_search(clean_query)

        payload = {
            "api_key": settings.tavily_api_key,
            "query": clean_query,
            "max_results": max(1, int(settings.web_search_max_results)),
            "search_depth": "basic",
            "include_answer": False,
            "include_raw_content": False,
        }

        try:
            with httpx.Client(timeout=float(settings.tavily_timeout_seconds)) as client:
                response = client.post(f"{settings.tavily_base_url.rstrip('/')}/search", json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException as exc:  # pragma: no cover - exercised through fallback behavior
            fallback = _placeholder_web_search(clean_query)
            fallback.update({"web_search_used": False, "source": "placeholder", "error": f"timeout: {str(exc)}"})
            return fallback
        except httpx.HTTPStatusError as exc:  # pragma: no cover - exercised through fallback behavior
            fallback = _placeholder_web_search(clean_query)
            fallback.update({"web_search_used": False, "source": "placeholder", "error": f"http_error: {exc.response.status_code}"})
            return fallback
        except json.JSONDecodeError as exc:  # pragma: no cover - exercised through fallback behavior
            fallback = _placeholder_web_search(clean_query)
            fallback.update({"web_search_used": False, "source": "placeholder", "error": f"parse_error: {str(exc)}"})
            return fallback
        except Exception as exc:  # pragma: no cover - exercised through fallback behavior
            logger.warning(
                "Web search call failed; using placeholder fallback",
                extra={"error": str(exc), "query_length": len(clean_query)},
            )
            fallback = _placeholder_web_search(clean_query)
            fallback.update({"web_search_used": False, "source": "placeholder", "error": f"unknown_error: {str(exc)}"})
            return fallback

        # Validate response structure
        if not isinstance(data.get("results"), list):
            data["results"] = []

        results = []
        for item in data.get("results", []):
            results.append(
                {
                    "title": str(item.get("title", "")).strip(),
                    "url": str(item.get("url", "")).strip(),
                    "content": str(item.get("content") or item.get("snippet") or item.get("raw_content") or "").strip(),
                    "score": item.get("score"),
                }
            )

        return {
            "query": clean_query,
            "web_search_used": True,
            "source": "tavily",
            "results": results[: max(1, int(settings.web_search_max_results))],
            "answer": str(data.get("answer", "")).strip(),
        }


def bm25_search(query: str, documents: list[str], k: int = 5) -> list[dict[str, Any]]:
    """
    Perform BM25 retrieval on a list of document strings.
    
    Uses whitespace tokenization; handles punctuation, case normalization, 
    and stopwords should be pre-processed by caller for production use.
    
    Args:
        query: Search query string (non-empty)
        documents: List of document strings to search over (non-empty)
        k: Number of top results to return (must be positive integer)
    
    Returns:
        List of dicts with keys: text (document content), score (BM25 score), rank (0-indexed position in results)
    
    Raises:
        ValueError: if k is not a positive integer
    """
    # Input validation
    if not isinstance(k, int) or k < 1:
        raise ValueError("k must be a positive integer")
    
    if not documents or not query.strip():
        return []
    
    # Tokenize documents - simple whitespace tokenization
    tokenized_docs = [doc.split() for doc in documents]
    
    # Build BM25 index
    bm25_model = BM25Okapi(tokenized_docs)
    
    # Tokenize query with same method
    tokenized_query = query.split()
    
    # Get scores for all documents
    scores = bm25_model.get_scores(tokenized_query)
    
    # Create result list with scores and original indices
    results = []
    for idx, (doc, score) in enumerate(zip(documents, scores)):
        results.append({
            "text": doc,
            "score": float(score),
            "rank": idx,  # Will be updated after sorting
        })
    
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    
    # Update rank to reflect sorted position
    for rank, result in enumerate(results[:k]):
        result["rank"] = rank
    
    return results[:k]


def rerank(query: str, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Rerank documents using a cross-encoder model (second-stage ranking).
    
    Lazy-loads the cross-encoder/ms-marco-MiniLM-L-6-v2 model on first call.
    Falls back gracefully if sentence-transformers is unavailable.
    
    Args:
        query: Search query string
        documents: List of document dicts with "text" key (from RRF fusion)
    
    Returns:
        Top-3 documents sorted by cross-encoder score descending.
        If reranking fails, returns original documents (fail-open).
        Each returned doc dict includes "cross_encoder_score" field.
    """
    global _cross_encoder_model

    with safe_trace_span("tool.rerank", {"query_length": len(query), "documents_count": len(documents)}):
        if not documents or not query.strip():
            return documents[:3] if documents else []

        try:
            if _cross_encoder_model is None:
                try:
                    from sentence_transformers import CrossEncoder
                except ImportError:
                    logger.warning(
                        "sentence-transformers not available; skipping cross-encoder reranking",
                        extra={"query_length": len(query), "num_documents": len(documents)},
                    )
                    return documents[:3]

                _cross_encoder_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

            pairs = [(query, str(document.get("text", ""))) for document in documents]
            scores = _cross_encoder_model.predict(pairs)

            reranked: list[dict[str, Any]] = []
            for document, score in zip(documents, scores):
                reranked.append({**document, "cross_encoder_score": float(score)})

            reranked.sort(key=lambda item: item.get("cross_encoder_score", 0.0), reverse=True)
            return reranked[:3]

        except Exception as exc:
            logger.warning(
                "Cross-encoder reranking failed; skipping reranking",
                extra={"error": str(exc), "query_length": len(query), "num_documents": len(documents)},
            )
            return documents[:3]
