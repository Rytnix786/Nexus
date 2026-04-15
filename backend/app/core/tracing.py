from __future__ import annotations

from contextlib import contextmanager, nullcontext
import importlib
import logging
import os
from typing import Any

from app.core.settings import settings

logger = logging.getLogger(__name__)


def trace_span(name: str, metadata: dict[str, Any] | None = None):
    """Return a LangSmith trace context manager when enabled; otherwise no-op."""
    if not settings.langsmith_enabled:
        return nullcontext()

    try:
        if settings.langsmith_api_key and not os.environ.get("LANGSMITH_API_KEY"):
            os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
        if settings.langsmith_project and not os.environ.get("LANGSMITH_PROJECT"):
            os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project

        langsmith = importlib.import_module("langsmith")
        trace = getattr(langsmith, "trace", None)
        if callable(trace):
            return trace(name=name, metadata=metadata)

        logger.warning("LangSmith trace API not found; falling back to no-op tracing")
    except Exception as exc:  # pragma: no cover - exercised by fallback test
        logger.warning("LangSmith tracing unavailable; falling back to no-op tracing", extra={"error": str(exc)})

    return nullcontext()


@contextmanager
def safe_trace_span(name: str, metadata: dict[str, Any] | None = None):
    """Execute a trace span in fail-open mode without breaking business logic."""
    span = trace_span(name, metadata)

    try:
        span_token = span.__enter__()
    except Exception as exc:
        logger.warning("Trace span enter failed; continuing without tracing", extra={"error": str(exc), "span": name})
        yield
        return

    body_error: BaseException | None = None
    try:
        yield span_token
    except BaseException as exc:  # pragma: no cover - covered indirectly via behavior tests
        body_error = exc
        raise
    finally:
        try:
            if body_error is None:
                span.__exit__(None, None, None)
            else:
                span.__exit__(type(body_error), body_error, body_error.__traceback__)
        except Exception as exc:
            logger.warning("Trace span exit failed; continuing without tracing", extra={"error": str(exc), "span": name})
