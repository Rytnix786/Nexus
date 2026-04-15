from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Generator

from sqlalchemy.orm import Session

from app.agents.graph import build_graph
from app.core.logging import current_request_id, get_logger
from app.core.models import ApprovalDecisionRequest, BudgetResumeRequest, RunCreateRequest
from app.core.settings import settings
from app.core.state import AgentState
from app.core.tracing import safe_trace_span
from app.db import repository


TERMINAL = {"completed", "failed", "stopped", "rejected", "timeout", "budget_exhausted"}
logger = get_logger(__name__)


class Orchestrator:
    def __init__(self) -> None:
        self.graph = build_graph()

    def build_initial_state(self, request: RunCreateRequest, actor_subject: str = "anonymous") -> AgentState:
        now = datetime.now(timezone.utc)
        return {
            "run_id": uuid.uuid4().hex,
            "objective": request.objective,
            "uploaded_context": request.uploaded_context,
            "high_impact": request.high_impact,
            "status": "created",
            "current_node": "planner",
            "plan": "",
            "research_notes": [],
            "analysis": "",
            "draft": "",
            "critique": "",
            "final_output": "",
            "retrieved_context": [],
            "iteration_count": 0,
            "max_iterations": settings.max_iterations,
            "initial_token_budget": request.token_budget,
            "token_budget_remaining": request.token_budget,
            "prompt_tokens_total": 0,
            "completion_tokens_total": 0,
            "total_tokens_used": 0,
            "metering_mode": "estimated",
            "quota_subject": actor_subject,
            "quota_daily_used": 0,
            "quota_daily_limit": settings.quota_daily_tokens,
            "run_deadline_epoch": time.time() + settings.max_run_seconds,
            "require_human_approval": request.high_impact,
            "human_decision": "",
            "human_reviewer": "",
            "human_notes": "",
            "started_at": now,
            "updated_at": now,
            "trace": [],
        }

    def start_stream(self, session: Session, request: RunCreateRequest, actor_subject: str = "anonymous") -> Generator[dict[str, Any], None, None]:
        state = self.build_initial_state(request, actor_subject=actor_subject)
        repository.create_run(session, state)
        yield {
            "event": "run_started",
            "data": {
                "run_id": state["run_id"],
                "status": state["status"],
                "current_node": state["current_node"],
                "initial_token_budget": request.token_budget,
                "token_budget_remaining": state["token_budget_remaining"],
                "quota_subject": actor_subject,
            },
        }

        yield from self._stream_via_worker_or_inline(session, state)

    def _stream_via_worker_or_inline(
        self,
        session: Session,
        state: dict[str, Any],
    ) -> Generator[dict[str, Any], None, None]:
        """
        Prefer worker-based execution via Redis/RQ, but fail open to inline
        orchestration when queueing/streaming infrastructure is unavailable.
        """
        try:
            import redis
            from rq import Queue
            from app.core.worker_task import run_orchestrator_job

            redis_conn = redis.from_url(settings.redis_url)
            q = Queue("nexus_runs", connection=redis_conn)
            q.enqueue(run_orchestrator_job, state)
            yield from self._tail_redis_events(str(state["run_id"]), redis_conn)
            return
        except Exception as exc:
            logger.warning(
                "Worker stream unavailable; falling back to inline execution",
                extra={"run_id": str(state.get("run_id", "")), "error": str(exc)},
            )
            yield from self._execute_stream(session, state)

    def _tail_redis_events(self, run_id: str, redis_conn) -> Generator[dict[str, Any], None, None]:
        pubsub = redis_conn.pubsub()
        pubsub.subscribe(f"run_events:{run_id}")
        
        try:
            for message in pubsub.listen():
                if message["type"] == "message":
                    event_data = message["data"].decode("utf-8")
                    try:
                        event = json.loads(event_data)
                        yield event
                        
                        data = event.get("data", {})
                        status = data.get("status", "")
                        
                        # Stop yielding if run hits a boundary condition
                        if status in TERMINAL or status == "awaiting_human" or event.get("event") == "run_error":
                            break
                    except json.JSONDecodeError:
                        pass
        finally:
            pubsub.unsubscribe()
            pubsub.close()

    def resume_stream(
        self,
        session: Session,
        run_id: str,
        request: ApprovalDecisionRequest,
        actor_subject: str = "anonymous",
    ) -> Generator[dict[str, Any], None, None]:
        state = repository.get_run_state(session, run_id)
        if state is None:
            raise KeyError("Run not found")

        if state.get("status") != "awaiting_human" or state.get("current_node") != "human_approval":
            raise ValueError("Run is not awaiting a human decision")
        if state.get("human_decision"):
            raise ValueError("Human decision already recorded")

        state["human_decision"] = request.decision
        state["human_reviewer"] = request.reviewer
        state["human_notes"] = request.notes
        state["status"] = "running"
        state["current_node"] = "human_approval"
        state["updated_at"] = datetime.now(timezone.utc)
        state["quota_subject"] = actor_subject

        repository.update_run(session, state)
        yield {
            "event": "run_resumed",
            "data": {
                "run_id": run_id,
                "decision": request.decision,
                "reviewer": request.reviewer,
            },
        }

        yield from self._stream_via_worker_or_inline(session, state)

    def resume_budget_stream(
        self,
        session: Session,
        run_id: str,
        request: BudgetResumeRequest,
        actor_subject: str = "anonymous",
    ) -> Generator[dict[str, Any], None, None]:
        state = repository.get_run_state(session, run_id)
        if state is None:
            raise KeyError("Run not found")
        if state.get("status") != "budget_exhausted":
            raise ValueError("Run is not budget exhausted")

        added = int(request.additional_budget)
        state["initial_token_budget"] = int(state.get("initial_token_budget", 0)) + added
        state["token_budget_remaining"] = int(state.get("token_budget_remaining", 0)) + added
        state["status"] = "running"
        state["quota_subject"] = actor_subject
        state["updated_at"] = datetime.now(timezone.utc)

        trace = list(state.get("trace", []))
        resume_node = "planner"
        for event in reversed(trace):
            node = str(event.get("node", "")).strip()
            if node and node not in {"orchestrator", "finalize"}:
                resume_node = node
                break
        state["current_node"] = resume_node

        repository.update_run(session, state)
        yield {
            "event": "run_resumed_budget",
            "data": {
                "run_id": run_id,
                "additional_budget": added,
                "token_budget_remaining": state["token_budget_remaining"],
                "current_node": state["current_node"],
                "status": state["status"],
            },
        }

        yield from self._stream_via_worker_or_inline(session, state)

    def _execute_stream(self, session: Session, state: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
        emitted_seq = len(state.get("trace", []))
        last_state = state

        with safe_trace_span(
            "orchestrator.execute_stream",
            {
                "run_id": str(state.get("run_id", "")),
                "trace_size": emitted_seq,
            },
        ):
            try:
                snapshots = self.graph.stream(
                    state,
                    stream_mode="values",
                    config={"recursion_limit": max(20, settings.max_iterations * 6)},
                )

                for snapshot in snapshots:
                    if not isinstance(snapshot, dict):
                        continue
                    last_state = snapshot
                    last_state["updated_at"] = datetime.now(timezone.utc)

                    persisted_state = repository.get_run_state(session, str(last_state.get("run_id", "")))
                    if persisted_state and persisted_state.get("stop_requested"):
                        stop_reason = str(persisted_state.get("stop_reason", "Stopped by operator"))
                        stop_actor = str(persisted_state.get("stop_requested_by", "unknown"))
                        trace = list(last_state.get("trace", []))
                        stop_event = {
                            "seq": len(trace) + 1,
                            "ts": datetime.now(timezone.utc).isoformat(),
                            "event_type": "run_stopped",
                            "node": "orchestrator",
                            "message": "Run stopped by operator",
                            "data": {
                                "reason": stop_reason,
                                "actor": stop_actor,
                            },
                        }
                        last_state["status"] = "stopped"
                        last_state["current_node"] = "finalize"
                        last_state["updated_at"] = datetime.now(timezone.utc)
                        last_state["trace"] = [*trace, stop_event]
                        repository.persist_step(
                            session,
                            state=last_state,
                            seq=int(stop_event["seq"]),
                            event_type="run_stopped",
                            node="orchestrator",
                            message="Run stopped by operator",
                            data={"reason": stop_reason, "actor": stop_actor},
                        )
                        yield {
                            "event": "timeline",
                            "data": {
                                "run_id": last_state["run_id"],
                                "seq": int(stop_event["seq"]),
                                "status": last_state["status"],
                                "current_node": last_state["current_node"],
                                "initial_token_budget": last_state.get("initial_token_budget", 0),
                                "token_budget_remaining": last_state.get("token_budget_remaining", 0),
                                "metering_mode": last_state.get("metering_mode", "estimated"),
                                "prompt_tokens_total": int(last_state.get("prompt_tokens_total", 0)),
                                "completion_tokens_total": int(last_state.get("completion_tokens_total", 0)),
                                "total_tokens_used": int(last_state.get("total_tokens_used", 0)),
                                "quota_subject": str(last_state.get("quota_subject", "")),
                                "quota_daily_limit": int(last_state.get("quota_daily_limit", settings.quota_daily_tokens)),
                                "quota_daily_used": int(last_state.get("quota_daily_used", 0)),
                                "message": stop_event["message"],
                                "event_type": stop_event["event_type"],
                                "node": stop_event["node"],
                                "data": stop_event["data"],
                            },
                        }
                        break

                    trace = last_state.get("trace", [])
                    if trace and trace[-1]["seq"] > emitted_seq:
                        evt = trace[-1]
                        emitted_seq = int(evt["seq"])
                        repository.persist_step(
                            session,
                            state=last_state,
                            seq=emitted_seq,
                            event_type=str(evt["event_type"]),
                            node=str(evt["node"]),
                            message=str(evt["message"]),
                            data=dict(evt.get("data", {})),
                        )
                        event_data = dict(evt.get("data", {}))
                        if settings.token_ledger_v2 and int(event_data.get("total_tokens", event_data.get("tokens_used", 0)) or 0) > 0:
                            prompt_tokens = int(event_data.get("prompt_tokens", 0) or 0)
                            completion_tokens = int(event_data.get("completion_tokens", event_data.get("tokens_used", 0)) or 0)
                            total_tokens = int(event_data.get("total_tokens", event_data.get("tokens_used", 0)) or 0)
                            metering_mode = str(event_data.get("metering_mode", "estimated"))
                            repository.append_token_usage(
                                session=session,
                                run_id=last_state["run_id"],
                                seq=emitted_seq,
                                node=str(evt["node"]),
                                provider="ollama",
                                model=settings.ollama_model,
                                prompt_tokens=prompt_tokens,
                                completion_tokens=completion_tokens,
                                total_tokens=total_tokens,
                                metering_mode=metering_mode,
                            )
                            quota_row = repository.consume_quota_tokens(
                                session,
                                subject=str(last_state.get("quota_subject", "anonymous")),
                                tokens=total_tokens,
                            )
                            last_state["quota_daily_used"] = int(quota_row.tokens_used)
                            last_state["metering_mode"] = metering_mode
                            last_state["prompt_tokens_total"] = int(last_state.get("prompt_tokens_total", 0)) + prompt_tokens
                            last_state["completion_tokens_total"] = int(last_state.get("completion_tokens_total", 0)) + completion_tokens
                            last_state["total_tokens_used"] = int(last_state.get("total_tokens_used", 0)) + total_tokens

                        logger.info(
                            "Timeline event emitted",
                            extra={
                                "run_id": last_state["run_id"],
                                "seq": emitted_seq,
                                "node": str(evt["node"]),
                                "event_type": str(evt["event_type"]),
                                "correlation_id": current_request_id(),
                            },
                        )

                        yield {
                            "event": "timeline",
                            "data": {
                                "run_id": last_state["run_id"],
                                "seq": emitted_seq,
                                "status": last_state["status"],
                                "current_node": last_state["current_node"],
                                "initial_token_budget": last_state.get("initial_token_budget", 0),
                                "token_budget_remaining": last_state["token_budget_remaining"],
                                "metering_mode": last_state.get("metering_mode", "estimated"),
                                "prompt_tokens_total": int(last_state.get("prompt_tokens_total", 0)),
                                "completion_tokens_total": int(last_state.get("completion_tokens_total", 0)),
                                "total_tokens_used": int(last_state.get("total_tokens_used", 0)),
                                "quota_subject": str(last_state.get("quota_subject", "")),
                                "quota_daily_limit": int(last_state.get("quota_daily_limit", settings.quota_daily_tokens)),
                                "quota_daily_used": int(last_state.get("quota_daily_used", 0)),
                                "message": evt["message"],
                                "event_type": evt["event_type"],
                                "node": evt["node"],
                                "data": evt.get("data", {}),
                            },
                        }
                    else:
                        repository.update_run(session, last_state)

                    if last_state.get("status") == "awaiting_human":
                        yield {
                            "event": "awaiting_approval",
                            "data": {
                                "run_id": last_state["run_id"],
                                "status": last_state["status"],
                                "current_node": last_state["current_node"],
                                "message": "Run paused for human approval",
                            },
                        }
                        return

                    if last_state.get("status") in TERMINAL:
                        break
            except Exception as exc:
                last_state["status"] = "failed"
                last_state["current_node"] = "finalize"
                last_state["updated_at"] = datetime.now(timezone.utc)
                trace = list(last_state.get("trace", []))
                error_event = {
                    "seq": len(trace) + 1,
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "event_type": "node_error",
                    "node": "orchestrator",
                    "message": "Execution stream failed",
                    "data": {"error": str(exc)},
                }
                last_state["trace"] = [*trace, error_event]
                try:
                    repository.persist_step(
                        session,
                        state=last_state,
                        seq=int(error_event["seq"]),
                        event_type="node_error",
                        node="orchestrator",
                        message="Execution stream failed",
                        data={"error": str(exc)},
                    )
                except Exception as persist_exc:
                    logger.warning(
                        "Persisting orchestrator error event failed; updating run state only",
                        extra={"run_id": last_state.get("run_id", ""), "error": str(persist_exc)},
                    )
                    repository.update_run(session, last_state)

                yield {
                    "event": "timeline",
                    "data": {
                        "run_id": last_state["run_id"],
                        "seq": int(error_event["seq"]),
                        "status": last_state["status"],
                        "current_node": last_state["current_node"],
                        "token_budget_remaining": last_state.get("token_budget_remaining", 0),
                        "message": error_event["message"],
                        "event_type": error_event["event_type"],
                        "node": error_event["node"],
                        "data": error_event["data"],
                    },
                }

        yield {
            "event": "run_finished",
            "data": {
                "run_id": last_state["run_id"],
                "status": last_state["status"],
                "current_node": last_state["current_node"],
                "output": last_state.get("final_output", ""),
                "initial_token_budget": last_state.get("initial_token_budget", 0),
                "token_budget_remaining": last_state.get("token_budget_remaining", 0),
                "metering_mode": last_state.get("metering_mode", "estimated"),
                "prompt_tokens_total": int(last_state.get("prompt_tokens_total", 0)),
                "completion_tokens_total": int(last_state.get("completion_tokens_total", 0)),
                "total_tokens_used": int(last_state.get("total_tokens_used", 0)),
                "quota_subject": str(last_state.get("quota_subject", "")),
                "quota_daily_limit": int(last_state.get("quota_daily_limit", settings.quota_daily_tokens)),
                "quota_daily_used": int(last_state.get("quota_daily_used", 0)),
            },
        }


def sse_pack(event: dict[str, Any]) -> str:
    event_name = event.get("event", "message")
    payload = json.dumps(event.get("data", {}), default=str)
    return f"event: {event_name}\ndata: {payload}\n\n"
