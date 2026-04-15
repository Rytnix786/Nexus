from __future__ import annotations

import importlib
import os
import types

import pytest

from app.core.settings import settings


class _DummySpan:
    entered = False

    def __enter__(self):
        self.entered = True
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _BrokenSpanOnEnter:
    def __enter__(self):
        raise RuntimeError("enter failed")

    def __exit__(self, exc_type, exc, tb):
        return False


class _BrokenSpanOnExit:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        raise RuntimeError("exit failed")


@pytest.fixture
def reset_tracing_flag(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", False, raising=False)


def test_trace_span_is_noop_when_disabled(monkeypatch: pytest.MonkeyPatch, reset_tracing_flag):
    def _should_not_import(_name: str):
        raise AssertionError("langsmith should not be imported when tracing is disabled")

    monkeypatch.setattr(importlib, "import_module", _should_not_import)

    from app.core.tracing import trace_span

    with trace_span("unit_test_span"):
        pass


def test_trace_span_is_noop_when_langsmith_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)

    def _missing(_name: str):
        raise ModuleNotFoundError("No module named 'langsmith'")

    monkeypatch.setattr(importlib, "import_module", _missing)

    from app.core.tracing import trace_span

    with trace_span("missing_langsmith"):
        pass


def test_trace_span_uses_langsmith_trace_when_available(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)

    observed: dict[str, object] = {}

    def _fake_trace(*, name: str, metadata: dict[str, object] | None = None):
        observed["name"] = name
        observed["metadata"] = metadata
        return _DummySpan()

    fake_module = types.SimpleNamespace(trace=_fake_trace)

    def _fake_import(name: str):
        if name != "langsmith":
            raise ModuleNotFoundError(name)
        return fake_module

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    from app.core.tracing import trace_span

    with trace_span("available_langsmith", {"run_id": "abc123"}):
        pass

    assert observed["name"] == "available_langsmith"
    assert observed["metadata"] == {"run_id": "abc123"}


def test_trace_span_is_noop_when_trace_api_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)

    def _fake_import(name: str):
        if name != "langsmith":
            raise ModuleNotFoundError(name)
        return types.SimpleNamespace()

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    from app.core.tracing import trace_span

    with trace_span("missing_trace_api"):
        pass


def test_trace_span_sets_langsmith_env_defaults(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)
    monkeypatch.setattr(settings, "langsmith_api_key", "ls-key-123", raising=False)
    monkeypatch.setattr(settings, "langsmith_project", "nexus-test-project", raising=False)
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    def _fake_trace(*, name: str, metadata: dict[str, object] | None = None):
        return _DummySpan()

    fake_module = types.SimpleNamespace(trace=_fake_trace)

    def _fake_import(name: str):
        if name != "langsmith":
            raise ModuleNotFoundError(name)
        return fake_module

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    from app.core.tracing import trace_span

    with trace_span("env_wiring"):
        pass

    assert os.environ.get("LANGSMITH_API_KEY") == "ls-key-123"
    assert os.environ.get("LANGSMITH_PROJECT") == "nexus-test-project"


def test_safe_trace_span_fails_open_when_enter_raises(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)

    def _fake_trace(*, name: str, metadata=None):
        return _BrokenSpanOnEnter()

    fake_module = types.SimpleNamespace(trace=_fake_trace)

    def _fake_import(name: str):
        if name != "langsmith":
            raise ModuleNotFoundError(name)
        return fake_module

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    from app.core.tracing import safe_trace_span

    with safe_trace_span("broken_enter"):
        pass


def test_safe_trace_span_fails_open_when_exit_raises(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)

    def _fake_trace(*, name: str, metadata=None):
        return _BrokenSpanOnExit()

    fake_module = types.SimpleNamespace(trace=_fake_trace)

    def _fake_import(name: str):
        if name != "langsmith":
            raise ModuleNotFoundError(name)
        return fake_module

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    from app.core.tracing import safe_trace_span

    with safe_trace_span("broken_exit"):
        pass


def test_safe_trace_span_preserves_body_error_when_exit_fails(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "langsmith_enabled", True, raising=False)

    def _fake_trace(*, name: str, metadata=None):
        return _BrokenSpanOnExit()

    fake_module = types.SimpleNamespace(trace=_fake_trace)

    def _fake_import(name: str):
        if name != "langsmith":
            raise ModuleNotFoundError(name)
        return fake_module

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    from app.core.tracing import safe_trace_span

    with pytest.raises(ValueError, match="body failed"):
        with safe_trace_span("broken_exit_with_body_error"):
            raise ValueError("body failed")
