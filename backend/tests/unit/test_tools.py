from __future__ import annotations

import sys
import types

import app.agents.tools as tools


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