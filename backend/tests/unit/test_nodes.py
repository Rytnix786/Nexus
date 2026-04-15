from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

import app.agents.nodes as nodes
from app.core.cache import clear_cache


@pytest.fixture(autouse=True)
def _clear_cache_before_each_test():
    """Clear cache before each test to avoid cross-test pollution."""
    clear_cache()
    yield
    clear_cache()


def _base_state(**overrides) -> Any:
    state: dict[str, Any] = {
        "run_id": "run-1",
        "objective": "Research the migration plan",
        "high_impact": False,
        "status": "created",
        "current_node": "planner",
        "plan": "",
        "research_notes": [],
        "analysis": "",
        "draft": "",
        "critique": "",
        "final_output": "",
        "uploaded_context": "",
        "retrieved_context": [],
        "iteration_count": 0,
        "max_iterations": 4,
        "token_budget_remaining": 1000,
        "run_deadline_epoch": 9_999_999_999.0,
        "require_human_approval": False,
        "human_decision": "",
        "human_reviewer": "",
        "human_notes": "",
        "insufficient_context": False,
        "started_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "trace": [],
    }
    state.update(overrides)
    return state


class _FakeResponse:
    def __init__(self, text: str, status_code: int = 200) -> None:
        self._text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("boom")

    def json(self) -> dict[str, str]:
        return {"response": self._text}

    @property
    def text(self) -> str:
        return self._text


class _FakeClient:
    def __init__(self, response_text: str = "generated text") -> None:
        self.response_text = response_text
        self.requests = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url: str, json: dict[str, object], timeout: float | None = None):
        self.requests.append({"url": url, "json": json, "timeout": timeout})
        return _FakeResponse(self.response_text)


def _install_fake_client(monkeypatch: pytest.MonkeyPatch, response_text: str = "generated text") -> _FakeClient:
    fake_client = _FakeClient(response_text=response_text)
    monkeypatch.setattr(nodes.httpx, "Client", lambda: fake_client)
    monkeypatch.setattr(nodes.settings, "ollama_base_url", "http://ollama.local")
    monkeypatch.setattr(nodes.settings, "ollama_model", "nexus-model")
    return fake_client


def test_planner_creates_plan_and_routes_to_researcher(monkeypatch: pytest.MonkeyPatch):
    fake_client = _install_fake_client(monkeypatch, "1. Scope the topic.\n2. Gather evidence.\n3. Summarize findings.")

    result = nodes.planner_node(_base_state())

    assert result["status"] == "running"
    assert result["current_node"] == "researcher"
    assert result["plan"] == "1. Scope the topic.\n2. Gather evidence.\n3. Summarize findings."
    assert result["token_budget_remaining"] == 985
    assert result["trace"][-1]["event_type"] == "plan_created"
    assert result["trace"][-1]["node"] == "planner"
    assert fake_client.requests[0]["url"] == "http://ollama.local/api/generate"
    assert fake_client.requests[0]["json"]["model"] == "nexus-model"


def test_researcher_keeps_researching_before_advancing(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "- Finding A\n- Finding B")

    first = nodes.researcher_node(_base_state(plan="Step 1\nStep 2"))
    second = nodes.researcher_node(_base_state(plan="Step 1\nStep 2", iteration_count=1))

    assert first["iteration_count"] == 1
    assert first["current_node"] == "researcher"
    assert first["research_notes"] == ["- Finding A\n- Finding B"]
    assert first["trace"][-1]["event_type"] == "research_completed"

    assert second["iteration_count"] == 2
    assert second["current_node"] == "analyst"
    assert second["research_notes"] == ["- Finding A\n- Finding B"]


def test_researcher_includes_web_search_results_in_prompt(monkeypatch: pytest.MonkeyPatch):
    fake_client = _install_fake_client(monkeypatch, "- Finding A\n- Finding B")
    reranked_docs = [
        {"text": "Ranked doc 3", "rrf_score": 0.98, "cross_encoder_score": 0.93},
        {"text": "Ranked doc 1", "rrf_score": 0.94, "cross_encoder_score": 0.88},
        {"text": "Ranked doc 2", "rrf_score": 0.91, "cross_encoder_score": 0.81},
    ]
    captured: dict[str, Any] = {}

    monkeypatch.setattr(
        nodes,
        "web_search",
        lambda query: {
            "query": query,
            "web_search_used": True,
            "source": "tavily",
            "results": [
                {
                    "title": "Official migration guide",
                    "url": "https://example.com/migration-guide",
                    "content": "Use a phased rollout and verify checkpoints.",
                },
                {
                    "title": "Cutover checklist",
                    "url": "https://example.com/cutover-checklist",
                    "content": "Validate backups, observability, and rollback paths.",
                },
                {
                    "title": "Rollback procedure",
                    "url": "https://example.com/rollback-procedure",
                    "content": "Document the trigger conditions and communication steps.",
                },
                {
                    "title": "Validation playbook",
                    "url": "https://example.com/validation-playbook",
                    "content": "Confirm post-deploy metrics before widening traffic.",
                },
                {
                    "title": "Postmortem template",
                    "url": "https://example.com/postmortem-template",
                    "content": "Capture lessons learned and remediation tasks.",
                },
            ],
        },
    )
    monkeypatch.setattr(
        nodes,
        "rerank",
        lambda query, documents: captured.update({"query": query, "documents": list(documents)}) or reranked_docs,
    )

    result = nodes.researcher_node(_base_state(plan="Step 1\nStep 2"))

    prompt = str(fake_client.requests[0]["json"]["prompt"])
    assert "Web search findings" in prompt
    assert "Official migration guide" in prompt
    assert captured["query"] == "Research the migration plan"
    assert len(captured["documents"]) == 5
    assert result["retrieved_context"] == reranked_docs
    assert len(result["retrieved_context"]) == 3
    assert result["trace"][-1]["data"]["search_query"] == "Research the migration plan"
    assert result["trace"][-1]["data"]["results_found"] == 5
    assert result["trace"][-1]["data"]["web_search_used"] is True


def test_analyst_creates_synthesis(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Synthesis of the research.")

    long_notes = [
        "This is the first comprehensive research note with detailed findings about the topic. It contains substantial information with multiple data points and observations.",
        "This is the second research note with additional context and supporting evidence. Together both notes provide sufficient context for analysis and synthesis.",
    ]
    result = nodes.analyst_node(_base_state(research_notes=long_notes))

    assert result["analysis"] == "Synthesis of the research."
    assert result["current_node"] == "writer"
    assert result["status"] == "running"
    assert result["trace"][-1]["event_type"] == "analysis_done"


def test_writer_routes_to_human_approval_when_required(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Final report draft.")

    result = nodes.writer_node(_base_state(plan="Plan", analysis="Analysis", require_human_approval=True))

    assert result["draft"] == "Final report draft."
    assert result["current_node"] == "human_approval"
    assert result["status"] == "running"
    assert result["trace"][-1]["event_type"] == "draft_written"


def test_human_approval_pauses_when_no_decision():
    result = nodes.human_approval_node(_base_state(require_human_approval=True))

    assert result["status"] == "awaiting_human"
    assert result["current_node"] == "human_approval"
    assert result["trace"][-1]["event_type"] == "human_checkpoint"


def test_human_approval_rejects_and_routes_to_finalize():
    result = nodes.human_approval_node(_base_state(require_human_approval=True, human_decision="reject"))

    assert result["status"] == "rejected"
    assert result["current_node"] == "finalize"
    assert result["trace"][-1]["event_type"] == "human_checkpoint"


def test_critic_revisions_loop_until_approval(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "REVISION NEEDED: Add more detail.")

    result = nodes.critic_node(_base_state(draft="Draft text", iteration_count=1))

    assert result["status"] == "running"
    assert result["iteration_count"] == 2
    assert result["current_node"] == "writer"
    assert result["critique"] == "REVISION NEEDED: Add more detail."
    assert result["trace"][-1]["event_type"] == "critique_done"


def test_finalize_preserves_rejected_status_and_adds_metadata():
    result = nodes.finalize_node(_base_state(status="rejected", draft="Draft text", critique="Notes"))

    assert result["status"] == "rejected"
    assert result["current_node"] == "finalize"
    assert result["final_output"].startswith("Run ID: run-1")
    assert "Draft text" in result["final_output"]
    assert result["trace"][-1]["event_type"] == "finalized"


def test_timeout_guard_returns_terminal_state():
    result = nodes.planner_node(_base_state(run_deadline_epoch=0.0))

    assert result["status"] == "timeout"
    assert result["current_node"] == "finalize"
    assert len(result["trace"]) == 1
    assert result["trace"][-1]["node"] == "planner"


def test_budget_guard_returns_terminal_state():
    result = nodes.planner_node(_base_state(token_budget_remaining=0))

    assert result["status"] == "budget_exhausted"
    assert result["current_node"] == "finalize"
    assert result["final_output"].startswith("Run ID: run-1")
    assert len(result["trace"]) == 1
    assert result["trace"][-1]["node"] == "planner"


def test_writer_clamps_token_budget_to_zero(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "x" * 400)

    result = nodes.writer_node(
        _base_state(
            plan="Plan",
            analysis="Analysis",
            token_budget_remaining=10,
        )
    )

    assert result["status"] == "running"
    assert result["token_budget_remaining"] == 0
    assert result["trace"][-1]["data"]["tokens_used"] == 10


def test_writer_uses_expanded_num_predict(monkeypatch: pytest.MonkeyPatch):
    fake_client = _install_fake_client(monkeypatch, "Summary\n\nKey Findings\n- One\n\nRecommendations\n- One")

    result = nodes.writer_node(
        _base_state(
            plan="Plan",
            analysis="Analysis",
            token_budget_remaining=1200,
        )
    )

    assert result["status"] == "running"
    assert fake_client.requests[0]["json"]["options"]["num_predict"] >= 900


def test_writer_requests_continuation_for_incomplete_sections(monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []

    def fake_generate(state, node, prompt):
        calls.append(prompt)
        if len(calls) == 1:
            return "Summary\n\nKey Findings\n- Partial finding", 30, 900, {
                "prompt_tokens": 0,
                "completion_tokens": 30,
                "total_tokens": 30,
                "metering_mode": "estimated",
            }
        return "Recommendations\n- Action one\n\nRisks and Mitigations\n- Risk and mitigation", 20, 880, {
            "prompt_tokens": 0,
            "completion_tokens": 20,
            "total_tokens": 20,
            "metering_mode": "estimated",
        }

    monkeypatch.setattr(nodes, "_ollama_generate", fake_generate)

    result = nodes.writer_node(_base_state(plan="Plan", analysis="Analysis", token_budget_remaining=1000))

    assert len(calls) == 2
    assert "Continue and complete the same report" in calls[1]
    assert "Recommendations" in result["draft"]
    assert result["trace"][-1]["data"]["completed_sections"] is True


def test_ollama_error_returns_failed_and_logs_trace(monkeypatch: pytest.MonkeyPatch):
    class BrokenClient(_FakeClient):
        def post(self, url: str, json: dict[str, object], timeout: float | None = None):
            raise nodes.httpx.ConnectError("offline", request=None)

    broken_client = BrokenClient()
    monkeypatch.setattr(nodes.httpx, "Client", lambda: broken_client)
    monkeypatch.setattr(nodes.settings, "ollama_base_url", "http://ollama.local")
    monkeypatch.setattr(nodes.settings, "ollama_model", "nexus-model")

    result = nodes.planner_node(_base_state())

    assert result["status"] == "failed"
    assert result["current_node"] == "planner"
    assert result["trace"][-1]["event_type"] == "node_error"


def test_analyst_with_sufficient_context_routes_to_writer(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Synthesis of the research findings from multiple sources.")

    sufficient_notes = [
        "This is a long research note with plenty of detail and information about the topic. It contains multiple sentences with concrete data points.",
        "Another comprehensive research note with additional findings and observations. This note is also long enough to exceed the 200 character minimum threshold across all research notes combined.",
    ]
    retrieved_context = [
        {"text": sufficient_notes[0], "rrf_score": 0.9, "cross_encoder_score": 9.2},
        {"text": sufficient_notes[1], "rrf_score": 0.8, "cross_encoder_score": 8.7},
    ]
    result = nodes.analyst_node(_base_state(research_notes=sufficient_notes, retrieved_context=retrieved_context))

    assert result["status"] == "running"
    assert result["current_node"] == "writer"
    assert result["insufficient_context"] is False
    assert result["analysis"] == "Synthesis of the research findings from multiple sources."
    assert result["trace"][-1]["event_type"] == "analysis_done"
    assert result["trace"][-1]["data"]["insufficient_context"] is False


def test_analyst_with_low_context_count_triggers_refusal(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Synthesis attempt.")

    single_note = ["This is a long research note with plenty of detail and information."]
    retrieved_context = [{"text": single_note[0], "rrf_score": 0.7, "cross_encoder_score": 7.2}]
    result = nodes.analyst_node(_base_state(research_notes=single_note, retrieved_context=retrieved_context))

    assert result["status"] == "running"
    assert result["current_node"] == "refusal"
    assert result["insufficient_context"] is True
    assert result["trace"][-1]["event_type"] == "analysis_done"
    assert result["trace"][-1]["data"]["insufficient_context"] is True


def test_analyst_with_empty_context_triggers_refusal(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Synthesis attempt.")

    result = nodes.analyst_node(_base_state(research_notes=[], retrieved_context=[]))

    assert result["status"] == "running"
    assert result["current_node"] == "refusal"
    assert result["insufficient_context"] is True
    assert result["trace"][-1]["event_type"] == "analysis_done"
    assert result["trace"][-1]["data"]["insufficient_context"] is True


def test_refusal_node_outputs_insufficient_context_message():
    result = nodes.refusal_node(_base_state(research_notes=[]))

    assert result["status"] == "rejected"
    assert result["current_node"] == "finalize"
    assert "INSUFFICIENT_CONTEXT" in result["draft"]
    assert "did not contain enough information" in result["draft"]
    assert "INSUFFICIENT_CONTEXT" in result["final_output"]
    assert result["trace"][-1]["event_type"] == "insufficient_context"
    assert result["trace"][-1]["data"]["reason"] == "insufficient_context"


def test_analyst_uses_retrieved_context_for_insufficient_context(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Synthesis attempt.")

    # Long researcher notes alone should not bypass refusal if retrieved context is insufficient.
    long_notes = [
        "A" * 180,
        "B" * 180,
    ]
    insufficient_retrieved_context = [
        {"text": "tiny", "rrf_score": 0.1, "cross_encoder_score": 0.2}
    ]

    result = nodes.analyst_node(
        _base_state(
            research_notes=long_notes,
            retrieved_context=insufficient_retrieved_context,
        )
    )

    assert result["insufficient_context"] is True
    assert result["current_node"] == "refusal"


def test_analyst_refuses_when_retrieved_context_relevance_is_low(monkeypatch: pytest.MonkeyPatch):
    _install_fake_client(monkeypatch, "Synthesis attempt.")

    low_relevance_context = [
        {"text": "A" * 600, "rrf_score": 0.03, "cross_encoder_score": -2.8},
        {"text": "B" * 700, "rrf_score": 0.03, "cross_encoder_score": -3.9},
        {"text": "C" * 900, "rrf_score": 0.03, "cross_encoder_score": -4.5},
    ]

    result = nodes.analyst_node(
        _base_state(
            research_notes=["placeholder note 1", "placeholder note 2"],
            retrieved_context=low_relevance_context,
        )
    )

    assert result["insufficient_context"] is True
    assert result["current_node"] == "refusal"


def test_bm25_search_validates_k_parameter():
    """Verify that bm25_search validates k parameter."""
    from app.agents.tools import bm25_search
    
    documents = ["Document one", "Document two"]
    query = "document"
    
    # Test invalid k values
    with pytest.raises(ValueError, match="k must be a positive integer"):
        bm25_search(query, documents, k=0)
    
    with pytest.raises(ValueError, match="k must be a positive integer"):
        bm25_search(query, documents, k=-1)
    
    with pytest.raises(ValueError, match="k must be a positive integer"):
        bm25_search(query, documents, k=1.5)


def test_bm25_search_returns_top_k_results():
    """Verify that BM25 retrieval returns top-k results sorted by score."""
    from app.agents.tools import bm25_search
    
    documents = [
        "The quick brown fox jumps over the lazy dog",
        "Machine learning is a subset of artificial intelligence",
        "Deep learning uses neural networks for pattern recognition",
        "Natural language processing enables text understanding",
        "Reinforcement learning through reward signals",
        "Supervised learning requires labeled training data",
    ]
    
    query = "machine learning neural networks"
    results = bm25_search(query, documents, k=3)
    
    # Verify top-k is respected
    assert len(results) == 3
    
    # Verify results are sorted by score descending
    scores = [result["score"] for result in results]
    assert scores == sorted(scores, reverse=True)
    
    # Verify rank field is correct (0-indexed position in results)
    for rank, result in enumerate(results):
        assert result["rank"] == rank, f"Expected rank {rank}, got {result['rank']}"
    
    # Verify top result contains relevant content
    assert "machine" in results[0]["text"].lower() or "neural" in results[0]["text"].lower()


def test_bm25_search_handles_empty_documents():
    """Verify bm25_search returns empty list for empty documents."""
    from app.agents.tools import bm25_search
    
    results = bm25_search("machine learning", [], k=5)
    assert results == []


def test_bm25_search_handles_empty_query():
    """Verify bm25_search returns empty list for empty/whitespace query."""
    from app.agents.tools import bm25_search
    
    docs = ["Document one", "Document two"]
    
    # Empty string
    results = bm25_search("", docs, k=5)
    assert results == []
    
    # Whitespace only
    results = bm25_search("   ", docs, k=5)
    assert results == []


def test_bm25_search_with_k_greater_than_document_count():
    """Verify k > len(docs) returns all docs with correct rank reindexing."""
    from app.agents.tools import bm25_search
    
    docs = ["machine learning algorithm", "deep learning neural network"]
    results = bm25_search("learning", docs, k=10)
    
    # Should return only 2 docs even though k=10
    assert len(results) == 2
    
    # Rank should be reindexed to 0, 1 (not original indices)
    ranks = [r["rank"] for r in results]
    assert ranks == [0, 1], f"Expected [0, 1], got {ranks}"


def test_rrf_fusion_with_empty_web_search_results(monkeypatch: pytest.MonkeyPatch):
    """Verify researcher_node handles empty web search gracefully."""
    fake_client = _install_fake_client(monkeypatch, "Finding from research.")
    monkeypatch.setattr(
        nodes,
        "web_search",
        lambda query: {
            "query": query,
            "web_search_used": False,
            "source": "placeholder",
            "results": [],  # Empty results
        },
    )
    
    result = nodes.researcher_node(_base_state(plan="Research topic"))
    retrieved = result.get("retrieved_context", [])
    
    # Should have empty retrieved_context for empty web results
    assert retrieved == []
    assert result["status"] == "running"
    assert result["current_node"] == "researcher"


def test_researcher_reranks_fused_context_to_top_three(monkeypatch: pytest.MonkeyPatch):
    """Verify researcher node stores only the reranked top-3 documents."""
    fake_client = _install_fake_client(monkeypatch, "Finding from research.")
    reranked_docs = [
        {"text": "Result 2 neural networks training", "rrf_score": 0.03333333333333333, "cross_encoder_score": 0.93},
        {"text": "Result 1 machine learning algorithms", "rrf_score": 0.03278688524590164, "cross_encoder_score": 0.88},
        {"text": "Result 3 deep learning models", "rrf_score": 0.03225806451612903, "cross_encoder_score": 0.81},
    ]
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        nodes,
        "web_search",
        lambda query: {
            "query": query,
            "web_search_used": True,
            "source": "tavily",
            "results": [
                {
                    "title": "Result 1",
                    "url": "https://example.com/1",
                    "content": "machine learning algorithms",
                },
                {
                    "title": "Result 2",
                    "url": "https://example.com/2",
                    "content": "neural networks training",
                },
                {
                    "title": "Result 3",
                    "url": "https://example.com/3",
                    "content": "deep learning models",
                },
            ],
        },
    )
    monkeypatch.setattr(
        nodes,
        "rerank",
        lambda query, documents: captured.update({"query": query, "documents": list(documents)}) or reranked_docs,
    )
    
    result = nodes.researcher_node(_base_state(plan="Research topic"))
    
    retrieved = result.get("retrieved_context", [])
    assert captured["query"] == "Research the migration plan"
    assert len(captured["documents"]) == 3
    assert retrieved == reranked_docs
    assert len(retrieved) == 3
    cross_encoder_scores = [item["cross_encoder_score"] for item in retrieved]
    assert cross_encoder_scores == sorted(cross_encoder_scores, reverse=True)


def test_rerank_returns_at_most_3_documents():
    """Verify rerank returns at most 3 documents regardless of input size."""
    from app.agents.tools import rerank
    
    # Create test documents
    documents = [
        {"text": "Machine learning fundamentals", "rrf_score": 0.5},
        {"text": "Deep learning architectures", "rrf_score": 0.4},
        {"text": "Neural network training", "rrf_score": 0.3},
        {"text": "Transformer models", "rrf_score": 0.2},
        {"text": "Large language models", "rrf_score": 0.1},
    ]
    
    query = "machine learning"
    result = rerank(query, documents)
    
    # Should return at most 3 documents
    assert len(result) <= 3
    
    # Empty input should return empty
    assert rerank(query, []) == []
    assert rerank("", documents[:2]) == documents[:2]


def test_rerank_output_sorted_by_score():
    """Verify rerank output is sorted by cross_encoder_score descending."""
    from app.agents.tools import rerank
    
    documents = [
        {"text": "Database optimization techniques", "rrf_score": 0.9},
        {"text": "SQL query performance", "rrf_score": 0.7},
        {"text": "Index creation patterns", "rrf_score": 0.6},
    ]
    
    query = "database performance optimization"
    result = rerank(query, documents)
    
    # Verify all results have cross_encoder_score
    for doc in result:
        assert "cross_encoder_score" in doc or len(result) == 0
    
    # If model is available and scores exist, verify descending order
    if any("cross_encoder_score" in doc for doc in result):
        scores = [doc.get("cross_encoder_score", 0) for doc in result]
        assert scores == sorted(scores, reverse=True), "Cross-encoder scores should be sorted descending"

