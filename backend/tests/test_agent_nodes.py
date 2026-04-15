from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest

from app.agents.nodes import (
    analyst_node,
    critic_node,
    finalize_node,
    human_approval_node,
    planner_node,
    researcher_node,
    writer_node,
)
from app.core.cache import clear_cache


@pytest.fixture(autouse=True)
def _clear_cache_before_each_test():
    """Clear cache before each test to avoid cross-test pollution."""
    clear_cache()
    yield
    clear_cache()


class FakeResponse:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, str]:
        return {"response": self._response_text}

    @property
    def text(self) -> str:
        return self._response_text


def make_state(**overrides) -> Any:
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
        "iteration_count": 0,
        "max_iterations": 4,
        "token_budget_remaining": 1000,
        "run_deadline_epoch": 9_999_999_999.0,
        "require_human_approval": False,
        "human_decision": "",
        "human_reviewer": "",
        "human_notes": "",
        "started_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "trace": [],
    }
    state.update(overrides)
    return state


def _patch_ollama(response_text: str):
    return patch("app.agents.nodes.httpx.Client.post", return_value=FakeResponse(response_text))


def _assert_tokens_used(result):
    evt = result["trace"][-1]
    assert isinstance(evt["data"]["tokens_used"], int)
    assert evt["data"]["tokens_used"] >= 0


def test_planner_sets_plan():
    with _patch_ollama("1. Scope the topic.\n2. Gather evidence.\n3. Summarize findings."):
        result = planner_node(make_state(objective="Assess the rollout strategy"))

    assert result["plan"]
    assert result["current_node"] == "researcher"
    _assert_tokens_used(result)


def test_researcher_increments_iteration():
    with _patch_ollama("- Finding A\n- Finding B"):
        result = researcher_node(make_state(plan="Step 1\nStep 2"))

    assert result["iteration_count"] == 1
    assert len(result["research_notes"]) == 1
    _assert_tokens_used(result)


def test_analyst_sets_analysis():
    with _patch_ollama("Synthesis of the research"):
        result = analyst_node(make_state(research_notes=[
            "The research revealed significant findings about the migration strategy. Key points include the need for phased rollout, checkpoint verification, and comprehensive testing protocols.",
            "Additional research notes indicate that resource allocation is critical for success. Team composition, timeline management, and risk mitigation strategies must all be considered."
        ]))

    assert result["analysis"]
    assert result["current_node"] == "writer"
    _assert_tokens_used(result)


def test_writer_routes_to_human_when_high_impact():
    with _patch_ollama("Final report draft"):
        result = writer_node(make_state(require_human_approval=True))

    assert result["current_node"] == "human_approval"
    _assert_tokens_used(result)


def test_writer_routes_to_critic_when_not_high_impact():
    with _patch_ollama("Final report draft"):
        result = writer_node(make_state(require_human_approval=False))

    assert result["current_node"] == "critic"
    _assert_tokens_used(result)


def test_human_approval_pauses_when_no_decision():
    result = human_approval_node(make_state(human_decision=""))

    assert result["status"] == "awaiting_human"
    _assert_tokens_used(result)


def test_human_approval_approves():
    result = human_approval_node(make_state(human_decision="approve"))

    assert result["current_node"] == "critic"
    _assert_tokens_used(result)


def test_human_approval_rejects():
    result = human_approval_node(make_state(human_decision="reject"))

    assert result["status"] == "rejected"
    _assert_tokens_used(result)


def test_critic_approves_and_routes_to_finalize():
    with _patch_ollama("APPROVED: looks good"):
        result = critic_node(make_state(draft="Draft text", iteration_count=1))

    assert result["current_node"] == "finalize"
    _assert_tokens_used(result)


def test_critic_requests_revision():
    with _patch_ollama("REVISION NEEDED: add more data"):
        result = critic_node(make_state(draft="Draft text", iteration_count=1))

    assert result["current_node"] == "writer"
    _assert_tokens_used(result)


def test_deadline_guard():
    with _patch_ollama("This response should not be used"):
        result = planner_node(make_state(run_deadline_epoch=0.0))

    assert result["status"] == "timeout"


def test_budget_guard():
    with _patch_ollama("This response should not be used"):
        result = planner_node(make_state(token_budget_remaining=0))

    assert result["status"] == "budget_exhausted"


def test_trace_event_emitted():
    with _patch_ollama("1. Scope the topic.\n2. Gather evidence.\n3. Summarize findings."):
        result = planner_node(make_state())

    assert len(result["trace"]) == 1
    _assert_tokens_used(result)


def test_finalize_sets_completed():
    result = finalize_node(make_state(status="running", draft="Final report draft"))

    assert result["status"] == "completed"
    assert result["final_output"]
    _assert_tokens_used(result)
