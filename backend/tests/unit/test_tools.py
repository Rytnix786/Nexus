from __future__ import annotations

from contextlib import contextmanager
import sys
import types

import app.agents.tools as tools
import app.core.tracing as tracing


def _install_fake_cross_encoder(monkeypatch, scores: list[float]) -> None:
    class FakeCrossEncoder:
        def __init__(self, model_name: str) -> None:
            self.model_name = model_name

        def predict(self, pairs):
            return list(scores)

    fake_module = types.ModuleType("sentence_transformers")
    fake_module.CrossEncoder = FakeCrossEncoder
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake_module)
    monkeypatch.setattr(tools, "_cross_encoder_model", None)


def test_rerank_limits_output_to_top_three(monkeypatch):
    _install_fake_cross_encoder(monkeypatch, [0.1, 0.8, 0.3, 0.7, 0.2])

    documents = [
        {"text": "doc-1"},
        {"text": "doc-2"},
        {"text": "doc-3"},
        {"text": "doc-4"},
        {"text": "doc-5"},
    ]

    result = tools.rerank("research query", documents)

    assert len(result) == 3


def test_rerank_sorts_by_cross_encoder_score_descending(monkeypatch):
    _install_fake_cross_encoder(monkeypatch, [0.2, 0.9, 0.4, 0.7])

    documents = [
        {"text": "doc-1"},
        {"text": "doc-2"},
        {"text": "doc-3"},
        {"text": "doc-4"},
    ]

    result = tools.rerank("research query", documents)

    scores = [document["cross_encoder_score"] for document in result]
    assert scores == sorted(scores, reverse=True)
    assert [document["text"] for document in result] == ["doc-2", "doc-4", "doc-3"]


def test_web_search_enters_trace_span(monkeypatch):
    observed: dict[str, object] = {}

    @contextmanager
    def _fake_safe_span(name: str, metadata=None):
        observed["name"] = name
        observed["metadata"] = metadata
        yield

    monkeypatch.setattr(tools, "safe_trace_span", _fake_safe_span)
    monkeypatch.setattr(tools.settings, "web_search_enabled", False)
    monkeypatch.setattr(tools.settings, "tavily_api_key", "")

    result = tools.web_search("hybrid search")

    assert result["source"] == "placeholder"
    assert observed["name"] == "tool.web_search"
    assert observed["metadata"] == {"query_length": 13}


def test_rerank_enters_trace_span(monkeypatch):
    observed: dict[str, object] = {}

    @contextmanager
    def _fake_safe_span(name: str, metadata=None):
        observed["name"] = name
        observed["metadata"] = metadata
        yield

    _install_fake_cross_encoder(monkeypatch, [0.9, 0.3, 0.5])
    monkeypatch.setattr(tools, "safe_trace_span", _fake_safe_span)

    documents = [{"text": "doc-1"}, {"text": "doc-2"}, {"text": "doc-3"}]
    tools.rerank("research query", documents)

    assert observed["name"] == "tool.rerank"
    assert observed["metadata"] == {"query_length": 14, "documents_count": 3}


def test_web_search_fails_open_when_trace_span_enter_raises(monkeypatch):
    class _BrokenSpanOnEnter:
        def __enter__(self):
            raise RuntimeError("trace enter failed")

        def __exit__(self, exc_type, exc, tb):
            return False

    def _broken_trace(*_args, **_kwargs):
        return _BrokenSpanOnEnter()

    monkeypatch.setattr(tracing, "trace_span", _broken_trace)
    monkeypatch.setattr(tools.settings, "web_search_enabled", False)
    monkeypatch.setattr(tools.settings, "tavily_api_key", "")

    result = tools.web_search("hybrid search")

    assert result["source"] == "placeholder"


def test_rerank_fails_open_when_trace_span_exit_raises(monkeypatch):
    class _BrokenSpanOnExit:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            raise RuntimeError("trace exit failed")

    def _broken_trace(*_args, **_kwargs):
        return _BrokenSpanOnExit()

    _install_fake_cross_encoder(monkeypatch, [0.4, 0.9, 0.1])
    monkeypatch.setattr(tracing, "trace_span", _broken_trace)

    result = tools.rerank("research query", [{"text": "a"}, {"text": "b"}, {"text": "c"}])

    assert len(result) == 3