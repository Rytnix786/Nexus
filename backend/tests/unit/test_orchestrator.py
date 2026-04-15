from __future__ import annotations

from contextlib import contextmanager

from app.core.orchestrator import Orchestrator
from app.db import repository


class _FailingGraph:
    def stream(self, *_args, **_kwargs):
        raise RuntimeError("synthetic stream failure")


def test_execute_stream_handles_graph_exception(monkeypatch):
    orchestrator = Orchestrator()
    orchestrator.graph = _FailingGraph()

    persisted: list[dict] = []

    def fake_persist_step(session, state, seq, event_type, node, message, data):
        persisted.append(
            {
                "seq": seq,
                "event_type": event_type,
                "node": node,
                "message": message,
                "data": data,
                "status": state.get("status"),
            }
        )

    monkeypatch.setattr(repository, "persist_step", fake_persist_step)

    state = {
        "run_id": "run-1",
        "status": "running",
        "current_node": "planner",
        "token_budget_remaining": 8000,
        "trace": [],
        "final_output": "",
    }

    events = list(orchestrator._execute_stream(session=None, state=state))

    assert len(events) == 2
    assert events[0]["event"] == "timeline"
    assert events[0]["data"]["event_type"] == "node_error"
    assert events[0]["data"]["status"] == "failed"
    assert events[1]["event"] == "run_finished"
    assert events[1]["data"]["status"] == "failed"

    assert state["status"] == "failed"
    assert state["current_node"] == "finalize"
    assert state["trace"][-1]["event_type"] == "node_error"

    assert len(persisted) == 1
    assert persisted[0]["event_type"] == "node_error"
    assert persisted[0]["status"] == "failed"


def test_execute_stream_opens_orchestrator_trace_span(monkeypatch):
    orchestrator = Orchestrator()
    orchestrator.graph = _FailingGraph()
    observed: dict[str, object] = {}

    @contextmanager
    def _fake_safe_trace_span(name: str, metadata: dict[str, object] | None = None):
        observed["name"] = name
        observed["metadata"] = metadata or {}
        yield

    monkeypatch.setattr("app.core.orchestrator.safe_trace_span", _fake_safe_trace_span)
    monkeypatch.setattr(repository, "persist_step", lambda *args, **kwargs: None)

    state = {
        "run_id": "run-42",
        "status": "running",
        "current_node": "planner",
        "token_budget_remaining": 900,
        "trace": [],
        "final_output": "",
    }

    events = list(orchestrator._execute_stream(session=None, state=state))

    assert events[-1]["event"] == "run_finished"
    assert observed["name"] == "orchestrator.execute_stream"
    assert observed["metadata"] == {"run_id": "run-42", "trace_size": 0}