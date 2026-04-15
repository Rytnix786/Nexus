from __future__ import annotations

from datetime import datetime, timezone

from app.agents.graph import build_graph, route_after_node


def _base_state(high_impact: bool = False) -> dict:
    return {
        "run_id": "r1",
        "objective": "Test objective",
        "high_impact": high_impact,
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
        "token_budget_remaining": 8000,
        "run_deadline_epoch": 9999999999.0,
        "require_human_approval": high_impact,
        "human_decision": "",
        "human_reviewer": "",
        "human_notes": "",
        "insufficient_context": False,
        "started_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "trace": [],
    }


def _install_linear_graph_stubs(monkeypatch, *, high_impact: bool) -> None:
    import app.agents.graph as graph_module

    monkeypatch.setattr(graph_module, "planner_node", lambda _state: {"status": "running", "current_node": "researcher"})
    monkeypatch.setattr(graph_module, "researcher_node", lambda _state: {"status": "running", "current_node": "analyst"})
    monkeypatch.setattr(
        graph_module,
        "analyst_node",
        lambda _state: {"status": "running", "current_node": "writer", "insufficient_context": False},
    )
    monkeypatch.setattr(
        graph_module,
        "writer_node",
        lambda _state: {"status": "running", "current_node": "human_approval" if high_impact else "critic"},
    )
    monkeypatch.setattr(graph_module, "critic_node", lambda _state: {"status": "running", "current_node": "finalize"})
    monkeypatch.setattr(graph_module, "human_approval_node", lambda _state: {"status": "awaiting_human", "current_node": "human_approval"})
    monkeypatch.setattr(graph_module, "refusal_node", lambda _state: {"status": "rejected", "current_node": "finalize"})
    monkeypatch.setattr(
        graph_module,
        "finalize_node",
        lambda state: {"status": state.get("status") if state.get("status") == "rejected" else "completed", "current_node": "finalize"},
    )


def test_non_high_impact_completes(monkeypatch):
    _install_linear_graph_stubs(monkeypatch, high_impact=False)
    graph = build_graph()
    state = graph.invoke(_base_state(high_impact=False))
    assert state["status"] == "completed"
    assert state["current_node"] == "finalize"


def test_high_impact_requires_approval(monkeypatch):
    _install_linear_graph_stubs(monkeypatch, high_impact=True)
    graph = build_graph()
    state = graph.invoke(_base_state(high_impact=True))
    assert state["status"] == "awaiting_human"
    assert state["current_node"] == "human_approval"


def test_route_after_node_allows_finalize_transition_for_rejected_state():
    route = route_after_node({"status": "rejected", "current_node": "finalize"})
    assert route == "finalize"
