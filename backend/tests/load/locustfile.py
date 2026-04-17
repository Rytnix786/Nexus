from __future__ import annotations

import json
import os
import time
import uuid
from collections import defaultdict
from pathlib import Path
from threading import Lock
from typing import Any

from locust import HttpUser, constant, events, task

DEFAULT_TIMEOUT_SECONDS = float(os.getenv("NEXUS_LOCUST_TIMEOUT_SECONDS", "180"))
RESULTS_PATH = Path(__file__).resolve().parent / "results" / "latest.json"


def _base_headers() -> dict[str, str]:
    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    api_key = (os.getenv("NEXUS_API_KEY") or "").strip()
    bearer = (os.getenv("NEXUS_BEARER_TOKEN") or "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    elif api_key:
        headers["X-API-Key"] = api_key
    return headers


class _Recorder:
    def __init__(self) -> None:
        self._lock = Lock()
        self._payload: dict[str, Any] = {
            "meta": {
                "generated_at": "",
                "host": "",
                "users": 0,
                "spawn_rate": 0,
                "run_time_seconds": 0,
            },
            "scenario_1_baseline_single_user": {
                "runs": 0,
                "ttfb_ms": [],
                "total_duration_ms": [],
                "final_total_tokens": [],
                "errors": [],
            },
            "scenario_2_concurrent_runs": {
                "runs": 0,
                "errors": [],
                "endpoint_latency_ms": {},
            },
            "scenario_3_sse_reconnect_resilience": {
                "attempts": 0,
                "successes": 0,
                "errors": [],
                "replay_start_seq": [],
                "expected_next_seq": [],
            },
            "scenario_4_budget_exhaustion_path": {
                "attempts": 0,
                "budget_exhausted": 0,
                "resume_completed": 0,
                "errors": [],
                "effective_start_budget": [],
            },
            "scenario_5_idempotency": {
                "attempts": 0,
                "same_run_id": 0,
                "errors": [],
            },
        }

    def set_meta(self, *, host: str, users: int, spawn_rate: float, run_time_seconds: float) -> None:
        with self._lock:
            self._payload["meta"] = {
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "host": host,
                "users": users,
                "spawn_rate": spawn_rate,
                "run_time_seconds": run_time_seconds,
            }

    def record_baseline(self, ttfb_ms: float, total_duration_ms: float, final_total_tokens: int) -> None:
        with self._lock:
            section = self._payload["scenario_1_baseline_single_user"]
            section["runs"] += 1
            section["ttfb_ms"].append(round(ttfb_ms, 3))
            section["total_duration_ms"].append(round(total_duration_ms, 3))
            section["final_total_tokens"].append(int(final_total_tokens))

    def baseline_error(self, message: str) -> None:
        with self._lock:
            self._payload["scenario_1_baseline_single_user"]["errors"].append(message)

    def concurrent_run(self) -> None:
        with self._lock:
            self._payload["scenario_2_concurrent_runs"]["runs"] += 1

    def concurrent_error(self, message: str) -> None:
        with self._lock:
            self._payload["scenario_2_concurrent_runs"]["errors"].append(message)

    def reconnect_attempt(self) -> None:
        with self._lock:
            self._payload["scenario_3_sse_reconnect_resilience"]["attempts"] += 1

    def reconnect_success(self, replay_start_seq: int, expected_next_seq: int) -> None:
        with self._lock:
            section = self._payload["scenario_3_sse_reconnect_resilience"]
            section["successes"] += 1
            section["replay_start_seq"].append(int(replay_start_seq))
            section["expected_next_seq"].append(int(expected_next_seq))

    def reconnect_error(self, message: str) -> None:
        with self._lock:
            self._payload["scenario_3_sse_reconnect_resilience"]["errors"].append(message)

    def budget_attempt(self, effective_budget: int) -> None:
        with self._lock:
            section = self._payload["scenario_4_budget_exhaustion_path"]
            section["attempts"] += 1
            section["effective_start_budget"].append(int(effective_budget))

    def budget_exhausted(self) -> None:
        with self._lock:
            self._payload["scenario_4_budget_exhaustion_path"]["budget_exhausted"] += 1

    def budget_resume_completed(self) -> None:
        with self._lock:
            self._payload["scenario_4_budget_exhaustion_path"]["resume_completed"] += 1

    def budget_error(self, message: str) -> None:
        with self._lock:
            self._payload["scenario_4_budget_exhaustion_path"]["errors"].append(message)

    def idempotency_attempt(self) -> None:
        with self._lock:
            self._payload["scenario_5_idempotency"]["attempts"] += 1

    def idempotency_same_run(self) -> None:
        with self._lock:
            self._payload["scenario_5_idempotency"]["same_run_id"] += 1

    def idempotency_error(self, message: str) -> None:
        with self._lock:
            self._payload["scenario_5_idempotency"]["errors"].append(message)

    def set_endpoint_latency(self, endpoint_latency_ms: dict[str, dict[str, float]]) -> None:
        with self._lock:
            self._payload["scenario_2_concurrent_runs"]["endpoint_latency_ms"] = endpoint_latency_ms

    def payload(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._payload))


RECORDER = _Recorder()


def _parse_sse_stream(response, *, max_events: int | None = None) -> list[dict[str, Any]]:
    events_out: list[dict[str, Any]] = []
    current_event = "message"

    for raw_line in response.iter_lines(decode_unicode=True):
        if not raw_line:
            continue
        line = raw_line.strip()
        if line.startswith("event: "):
            current_event = line.replace("event: ", "", 1).strip()
            continue
        if line.startswith("data: "):
            data_text = line.replace("data: ", "", 1).strip()
            try:
                payload = json.loads(data_text)
            except json.JSONDecodeError:
                payload = {"_raw": data_text}
            events_out.append({"event": current_event, "data": payload})
            if max_events is not None and len(events_out) >= max_events:
                break
            if current_event == "run_finished":
                break
    return events_out


def _extract_first_run_id(events_in: list[dict[str, Any]]) -> str:
    for event in events_in:
        data = event.get("data") or {}
        run_id = str(data.get("run_id") or "").strip()
        if run_id:
            return run_id
    return ""


def _extract_total_tokens(final_event_data: dict[str, Any], run_status_payload: dict[str, Any] | None) -> int:
    val = final_event_data.get("total_tokens_used")
    if isinstance(val, int):
        return val
    if run_status_payload is not None:
        total = run_status_payload.get("total_tokens_used")
        if isinstance(total, int):
            return total
    return 0


def _is_budget_exhausted(events_in: list[dict[str, Any]]) -> bool:
    for event in events_in:
        if event.get("event") != "run_finished":
            continue
        status = str((event.get("data") or {}).get("status") or "")
        if status == "budget_exhausted":
            return True
    return False


def _first_timeline_seq(events_in: list[dict[str, Any]]) -> int | None:
    for event in events_in:
        data = event.get("data") or {}
        seq = data.get("seq")
        if isinstance(seq, int):
            return seq
    return None


class _BaseNexusUser(HttpUser):
    abstract = True
    wait_time = constant(0.25)

    def _stream_run(
        self,
        *,
        objective: str,
        token_budget: int,
        idempotency_key: str | None = None,
        request_name: str = "/api/runs/stream",
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], str]:
        headers = _base_headers()
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        payload = {
            "objective": objective,
            "high_impact": False,
            "token_budget": token_budget,
        }

        started = time.perf_counter()
        first_event_ms: float | None = None
        events_in: list[dict[str, Any]] = []

        with self.client.post(
            "/api/runs/stream",
            headers=headers,
            json=payload,
            stream=True,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            name=request_name,
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                detail = f"HTTP {response.status_code}: {response.text[:250]}"
                response.failure(detail)
                return None, [], detail

            current_event = "message"
            for raw_line in response.iter_lines(decode_unicode=True):
                if not raw_line:
                    continue
                line = raw_line.strip()
                if line.startswith("event: "):
                    current_event = line.replace("event: ", "", 1).strip()
                    continue
                if not line.startswith("data: "):
                    continue
                if first_event_ms is None:
                    first_event_ms = (time.perf_counter() - started) * 1000.0

                body_text = line.replace("data: ", "", 1).strip()
                try:
                    data = json.loads(body_text)
                except json.JSONDecodeError:
                    data = {"_raw": body_text}
                events_in.append({"event": current_event, "data": data})

                if current_event == "run_finished":
                    break

            if not events_in:
                response.failure("No SSE events received")
                return None, [], "No SSE events received"

            response.success()

        total_ms = (time.perf_counter() - started) * 1000.0
        run_id = _extract_first_run_id(events_in)
        run_payload = None
        if run_id:
            headers_status = _base_headers()
            status_resp = self.client.get(f"/api/runs/{run_id}", headers=headers_status, name="/api/runs/{id}")
            if status_resp.status_code == 200:
                run_payload = status_resp.json()

        final_event_data = (events_in[-1].get("data") or {}) if events_in else {}
        return {
            "ttfb_ms": round(first_event_ms or total_ms, 3),
            "total_duration_ms": round(total_ms, 3),
            "run_id": run_id,
            "events": events_in,
            "run_status": run_payload,
            "total_tokens_used": _extract_total_tokens(final_event_data, run_payload),
            "final_status": str(final_event_data.get("status") or ""),
        }, events_in, ""


class BaselineSingleUser(_BaseNexusUser):
    fixed_count = 1
    tags = {"scenario1"}

    @task
    def baseline_stream(self) -> None:
        objective = "Baseline objective: summarize latest resilient API release process and risks."
        result, _events_in, err = self._stream_run(objective=objective, token_budget=8000, request_name="scenario1:/api/runs/stream")
        if result is None:
            RECORDER.baseline_error(err)
            return
        RECORDER.record_baseline(
            ttfb_ms=float(result["ttfb_ms"]),
            total_duration_ms=float(result["total_duration_ms"]),
            final_total_tokens=int(result["total_tokens_used"]),
        )


class ConcurrentRunsUser(_BaseNexusUser):
    weight = 8
    tags = {"scenario2"}

    @task
    def concurrent_stream(self) -> None:
        objective = f"Concurrent objective {uuid.uuid4().hex}: map rollout dependencies and fallback paths."
        result, _events_in, err = self._stream_run(objective=objective, token_budget=8000, request_name="scenario2:/api/runs/stream")
        if result is None:
            RECORDER.concurrent_error(err)
            return
        RECORDER.concurrent_run()


class SSEReconnectResilienceUser(_BaseNexusUser):
    weight = 1
    tags = {"scenario3"}

    @task
    def sse_reconnect(self) -> None:
        RECORDER.reconnect_attempt()

        objective = f"Reconnect objective {uuid.uuid4().hex}: evaluate replay correctness over SSE reconnect."
        first_result, first_events, err = self._stream_run(
            objective=objective,
            token_budget=8000,
            request_name="scenario3:first:/api/runs/stream",
        )
        if first_result is None:
            RECORDER.reconnect_error(f"initial stream failed: {err}")
            return

        run_id = str(first_result.get("run_id") or "")
        if not run_id:
            RECORDER.reconnect_error("initial stream missing run_id")
            return

        timeline_headers = _base_headers()
        timeline_resp = self.client.get(f"/api/runs/{run_id}/timeline", headers=timeline_headers, name="scenario3:/api/runs/{id}/timeline")
        if timeline_resp.status_code != 200:
            RECORDER.reconnect_error(f"timeline fetch failed: {timeline_resp.status_code}")
            return

        timeline_events = list((timeline_resp.json() or {}).get("events") or [])
        if len(timeline_events) < 3:
            RECORDER.reconnect_error("not enough timeline events for reconnect check")
            return

        last_seen_seq = int(timeline_events[2]["seq"])
        expected_next = last_seen_seq + 1

        reconnect_headers = _base_headers()
        reconnect_headers["Last-Event-ID"] = str(last_seen_seq)
        reconnect_payload = {
            "decision": "approve",
            "reviewer": "loadtest_reviewer",
            "notes": "resume for replay verification",
        }

        reconnect_resp = self.client.post(
            f"/api/runs/{run_id}/resume/stream",
            headers=reconnect_headers,
            json=reconnect_payload,
            stream=True,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            name="scenario3:/api/runs/{id}/resume/stream",
        )

        if reconnect_resp.status_code not in (200, 409):
            RECORDER.reconnect_error(f"reconnect failed: {reconnect_resp.status_code}")
            return

        replay_events = _parse_sse_stream(reconnect_resp, max_events=20)
        reconnect_resp.close()

        replay_start = _first_timeline_seq(replay_events)
        if replay_start is None:
            RECORDER.reconnect_error("reconnect had no replayed timeline events")
            return

        if replay_start != expected_next:
            RECORDER.reconnect_error(f"replay started at seq={replay_start}, expected={expected_next}")
            return

        RECORDER.reconnect_success(replay_start_seq=replay_start, expected_next_seq=expected_next)


class BudgetExhaustionUser(_BaseNexusUser):
    weight = 1
    tags = {"scenario4"}

    @task
    def budget_exhaustion_then_resume(self) -> None:
        # API validation currently enforces token_budget >= 1000.
        start_budget = 1000
        objective = f"Budget path objective {uuid.uuid4().hex}: force budget exhaustion and resume."

        result, events_in, err = self._stream_run(
            objective=objective,
            token_budget=start_budget,
            request_name="scenario4:/api/runs/stream",
        )

        RECORDER.budget_attempt(effective_budget=start_budget)

        if result is None:
            RECORDER.budget_error(err)
            return

        run_id = str(result.get("run_id") or "")
        if not run_id:
            RECORDER.budget_error("run_id missing from budget scenario")
            return

        if not _is_budget_exhausted(events_in):
            status_payload = result.get("run_status") or {}
            if str(status_payload.get("status") or "") != "budget_exhausted":
                RECORDER.budget_error("run did not enter budget_exhausted")
                return

        RECORDER.budget_exhausted()

        headers = _base_headers()
        headers["Idempotency-Key"] = f"resume-budget-{uuid.uuid4().hex}"
        resume_resp = self.client.post(
            f"/api/runs/{run_id}/resume-budget/stream",
            headers=headers,
            json={"additional_budget": 4000},
            stream=True,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            name="scenario4:/api/runs/{id}/resume-budget/stream",
            catch_response=True,
        )

        with resume_resp as response:
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}: {response.text[:250]}")
                RECORDER.budget_error(f"resume failed: {response.status_code}")
                return

            resumed_events = _parse_sse_stream(response)
            finished = any(e.get("event") == "run_finished" and str((e.get("data") or {}).get("status")) == "completed" for e in resumed_events)
            if not finished:
                response.failure("resume stream did not finish with completed status")
                RECORDER.budget_error("resume stream did not finish with completed")
                return

            response.success()
            RECORDER.budget_resume_completed()


class IdempotencyUser(_BaseNexusUser):
    weight = 1
    tags = {"scenario5"}

    @task
    def idempotency_same_key_same_run(self) -> None:
        RECORDER.idempotency_attempt()

        key = f"idem-{uuid.uuid4().hex}"
        objective = "Idempotency objective: verify duplicate submission returns same run id."

        first_result, _events_first, err_first = self._stream_run(
            objective=objective,
            token_budget=8000,
            idempotency_key=key,
            request_name="scenario5:first:/api/runs/stream",
        )
        if first_result is None:
            RECORDER.idempotency_error(f"first request failed: {err_first}")
            return

        second_result, _events_second, err_second = self._stream_run(
            objective=objective,
            token_budget=8000,
            idempotency_key=key,
            request_name="scenario5:second:/api/runs/stream",
        )
        if second_result is None:
            RECORDER.idempotency_error(f"second request failed: {err_second}")
            return

        run_id_1 = str(first_result.get("run_id") or "")
        run_id_2 = str(second_result.get("run_id") or "")
        if not run_id_1 or not run_id_2:
            RECORDER.idempotency_error("missing run_id in idempotency check")
            return

        if run_id_1 != run_id_2:
            RECORDER.idempotency_error(f"run_id mismatch: {run_id_1} != {run_id_2}")
            return

        RECORDER.idempotency_same_run()


def _latency_summary(environment) -> dict[str, dict[str, float]]:
    endpoint_stats: dict[str, dict[str, float]] = {}
    grouped: dict[str, list[Any]] = defaultdict(list)

    for (name, _method), entry in environment.stats.entries.items():
        grouped[str(name)].append(entry)

    for endpoint, entries in grouped.items():
        if not entries:
            continue
        merged = entries[0]
        endpoint_stats[endpoint] = {
            "requests": float(merged.num_requests),
            "failures": float(merged.num_failures),
            "p50": round(float(merged.get_response_time_percentile(0.50)), 3),
            "p95": round(float(merged.get_response_time_percentile(0.95)), 3),
            "p99": round(float(merged.get_response_time_percentile(0.99)), 3),
        }

    return endpoint_stats


@events.test_start.add_listener
def _on_test_start(environment, **_kwargs):
    options = getattr(environment, "parsed_options", None)
    users = int(getattr(options, "users", 0) or getattr(options, "num_users", 0) or 0)
    spawn_rate = float(getattr(options, "spawn_rate", 0.0) or 0.0)
    run_time_seconds = 0.0
    run_time_raw = getattr(options, "run_time", "")
    if isinstance(run_time_raw, (int, float)):
        run_time_seconds = float(run_time_raw)
    else:
        run_time_value = str(run_time_raw or "").strip()
        if run_time_value.endswith("m") and run_time_value[:-1].isdigit():
            run_time_seconds = float(int(run_time_value[:-1]) * 60)
        elif run_time_value.endswith("s") and run_time_value[:-1].isdigit():
            run_time_seconds = float(int(run_time_value[:-1]))
    RECORDER.set_meta(
        host=str(getattr(environment, "host", "") or ""),
        users=users,
        spawn_rate=spawn_rate,
        run_time_seconds=run_time_seconds,
    )


@events.quitting.add_listener
def _on_quitting(environment, **_kwargs):
    RECORDER.set_endpoint_latency(_latency_summary(environment))
    payload = RECORDER.payload()
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
