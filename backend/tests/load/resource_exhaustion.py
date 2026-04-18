from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from pathlib import Path
from threading import Lock
from typing import Any

from locust import HttpUser, constant, events, task

from .locustfile import _BaseNexusUser, DEFAULT_TIMEOUT_SECONDS


class SSEConnectionFloodUser(_BaseNexusUser):
    """Test SSE connection limits and resource exhaustion."""
    
    weight = 2
    tags = {"sse_flood"}
    
    @task
    def sse_connection_flood(self) -> None:
        """Open many SSE connections to test connection limits."""
        headers = self._base_headers()
        connections = []
        
        try:
            # Open multiple SSE connections simultaneously
            for i in range(50):  # Try to open 50 connections
                payload = {
                    "objective": f"SSE flood test {uuid.uuid4().hex[:8]} connection #{i+1}",
                    "high_impact": False,
                    "token_budget": 500,
                }
                
                resp = self.client.post(
                    "/api/runs/stream",
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=300,  # 5 minutes
                    name=f"sse_flood:connection_{i+1}",
                    catch_response=True
                )
                
                if resp.status_code == 200:
                    connections.append(resp)
                    RESOURCE_RECORDER.record_sse_connection_opened()
                    # Read a few events to keep connection alive
                    event_count = 0
                    for line in resp.iter_lines(decode_unicode=True):
                        if line.startswith("data: "):
                            event_count += 1
                            if event_count >= 3:  # Read 3 events then stop
                                break
                        elif line.startswith("event: run_finished"):
                            break
                else:
                    RESOURCE_RECORDER.record_sse_connection_failed(f"HTTP {resp.status_code}")
                    resp.failure(f"SSE connection failed: HTTP {resp.status_code}")
                
                # Small delay between connection attempts
                time.sleep(0.1)
            
            # Keep connections open for stress period
            RESOURCE_RECORDER.record_flood_test_results(len(connections), 50)
            time.sleep(60)  # Keep open for 1 minute
            
        except Exception as e:
            RESOURCE_RECORDER.record_sse_error(f"Connection flood error: {str(e)}")
        
        finally:
            # Clean up connections
            closed_count = 0
            for conn in connections:
                try:
                    if hasattr(conn, 'close'):
                        conn.close()
                        closed_count += 1
                except Exception as e:
                    RESOURCE_RECORDER.record_sse_error(f"Close error: {str(e)}")
            
            RESOURCE_RECORDER.record_sse_connections_closed(closed_count)


class MemoryLeakDetectionUser(_BaseNexusUser):
    """Long-running test to detect memory leaks in the system."""
    
    weight = 1
    tags = {"memory_leak"}
    
    @task
    def memory_leak_detection(self) -> None:
        """Run for extended period to detect memory growth."""
        headers = self._base_headers()
        start_time = time.perf_counter()
        operation_count = 0
        
        # Run for 30 minutes to detect memory leaks
        while time.perf_counter() - start_time < 1800:  # 30 minutes
            try:
                # Create a run
                payload = {
                    "objective": f"Memory leak detection run {uuid.uuid4().hex[:8]} #{operation_count}",
                    "high_impact": False,
                    "token_budget": 1000,
                }
                
                resp = self.client.post(
                    "/api/runs/stream",
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=120,
                    name="memory_leak:test_run"
                )
                
                run_id = None
                if resp.status_code == 200:
                    # Read some events to consume memory
                    events_read = 0
                    for line in resp.iter_lines(decode_unicode=True):
                        if line.startswith("data: "):
                            events_read += 1
                            if events_read >= 5:  # Read 5 events
                                break
                        elif line.startswith("event: run_finished"):
                            break
                    
                    # Try to get run_id from events
                    for line in resp.iter_lines(decode_unicode=True):
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line.replace("data: ", "", 1))
                                run_id = data.get("run_id")
                                if run_id:
                                    break
                            except json.JSONDecodeError:
                                pass
                    resp.close()
                
                # Immediately query the run to stress database
                if run_id:
                    query_resp = self.client.get(
                        f"/api/runs/{run_id}",
                        headers=headers,
                        name="memory_leak:run_query"
                    )
                    
                    if query_resp.status_code == 200:
                        RESOURCE_RECORDER.record_memory_operation_success()
                    else:
                        RESOURCE_RECORDER.record_memory_operation_failure()
                
                operation_count += 1
                
                # Periodic memory snapshot (every 50 operations)
                if operation_count % 50 == 0:
                    RESOURCE_RECORDER.record_memory_snapshot(operation_count, time.perf_counter() - start_time)
                
                time.sleep(2)  # 2 seconds between operations
                
            except Exception as e:
                RESOURCE_RECORDER.record_memory_error(f"Operation {operation_count}: {str(e)}")
        
        RESOURCE_RECORDER.record_memory_test_completed(operation_count, time.perf_counter() - start_time)


class RedisQueueSaturationUser(_BaseNexusUser):
    """Test Redis queue saturation and RQ worker performance."""
    
    weight = 1
    tags = {"redis_saturation"}
    
    @task
    def redis_queue_saturation(self) -> None:
        """Saturate Redis queue with many concurrent tasks."""
        headers = self._base_headers()
        
        # Submit many runs quickly to saturate the queue
        run_ids = []
        submission_time = time.perf_counter()
        
        for i in range(100):  # Submit 100 runs rapidly
            payload = {
                "objective": f"Redis saturation test {uuid.uuid4().hex[:8]} #{i+1}",
                "high_impact": False,
                "token_budget": 800,
            }
            
            try:
                resp = self.client.post(
                    "/api/runs/stream",
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=30,  # Short timeout to get run ID quickly
                    name=f"redis_saturation:submit_{i+1}"
                )
                
                if resp.status_code == 200:
                    # Get run_id from first event
                    for line in resp.iter_lines(decode_unicode=True):
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line.replace("data: ", "", 1))
                                run_id = data.get("run_id")
                                if run_id:
                                    run_ids.append(run_id)
                                    RESOURCE_RECORDER.record_redis_task_submitted()
                                    break
                            except json.JSONDecodeError:
                                pass
                            break
                    resp.close()
                else:
                    RESOURCE_RECORDER.record_redis_submission_failed(f"HTTP {resp.status_code}")
                
            except Exception as e:
                RESOURCE_RECORDER.record_redis_error(f"Submission {i+1}: {str(e)}")
            
            # Minimal delay between submissions
            time.sleep(0.05)
        
        submission_duration = (time.perf_counter() - submission_time) * 1000
        
        # Monitor queue depth by checking run statuses
        time.sleep(10)  # Let queue process a bit
        
        completed_count = 0
        running_count = 0
        failed_count = 0
        
        for run_id in run_ids[:20]:  # Check first 20 runs
            try:
                status_resp = self.client.get(
                    f"/api/runs/{run_id}",
                    headers=headers,
                    name="redis_saturation:status_check"
                )
                
                if status_resp.status_code == 200:
                    status_data = status_resp.json()
                    status = str(status_data.get("status") or "")
                    
                    if status in ["completed", "failed", "stopped"]:
                        completed_count += 1
                    elif status in ["running", "awaiting_human"]:
                        running_count += 1
                    else:
                        failed_count += 1
                else:
                    failed_count += 1
                    
            except Exception as e:
                RESOURCE_RECORDER.record_redis_error(f"Status check: {str(e)}")
                failed_count += 1
        
        RESOURCE_RECORDER.record_redis_saturation_results(
            submitted=len(run_ids),
            submission_time_ms=submission_duration,
            completed=completed_count,
            running=running_count,
            failed=failed_count
        )


class CPUExhaustionUser(_BaseNexusUser):
    """Test CPU exhaustion with computationally intensive operations."""
    
    weight = 1
    tags = {"cpu_exhaustion"}
    
    @task
    def cpu_exhaustion_test(self) -> None:
        """Test system behavior under CPU pressure."""
        headers = self._base_headers()
        
        # Submit complex tasks that require more CPU
        complex_objectives = [
            "Analyze the impact of quantum computing on cryptography including detailed technical specifications and implementation challenges",
            "Provide a comprehensive comparison of microservices architecture vs monolithic architecture including performance metrics, scalability analysis, and migration strategies",
            "Evaluate the environmental impact of blockchain technology including energy consumption analysis and sustainable alternatives",
            "Create a detailed technical analysis of machine learning model optimization techniques including quantization, pruning, and knowledge distillation methods",
        ]
        
        start_time = time.perf_counter()
        successful_runs = 0
        failed_runs = 0
        
        # Run complex tasks for 10 minutes
        while time.perf_counter() - start_time < 600:  # 10 minutes
            objective = complex_objectives[successful_runs % len(complex_objectives)]
            objective += f" [CPU stress test {uuid.uuid4().hex[:8]}]"
            
            payload = {
                "objective": objective,
                "high_impact": False,
                "token_budget": 3000,  # Larger budget for complex tasks
            }
            
            try:
                resp = self.client.post(
                    "/api/runs/stream",
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=300,  # 5 minutes
                    name="cpu_exhaustion:complex_task"
                )
                
                if resp.status_code == 200:
                    # Monitor resource usage during run
                    run_start = time.perf_counter()
                    events_processed = 0
                    
                    for line in resp.iter_lines(decode_unicode=True):
                        if line.startswith("data: "):
                            events_processed += 1
                        elif line.startswith("event: run_finished"):
                            break
                    
                    run_duration = time.perf_counter() - run_start
                    RESOURCE_RECORDER.record_cpu_task_completed(events_processed, run_duration)
                    successful_runs += 1
                    resp.success()
                else:
                    failed_runs += 1
                    resp.failure(f"CPU task failed: HTTP {resp.status_code}")
                    RESOURCE_RECORDER.record_cpu_task_failed()
                
            except Exception as e:
                failed_runs += 1
                RESOURCE_RECORDER.record_cpu_error(f"CPU task error: {str(e)}")
            
            time.sleep(5)  # 5 seconds between complex tasks
        
        RESOURCE_RECORDER.record_cpu_exhaustion_test_results(
            successful=successful_runs,
            failed=failed_runs,
            duration=time.perf_counter() - start_time
        )


class ResourceRecorder:
    """Recorder for resource exhaustion test metrics."""
    
    def __init__(self):
        self._lock = Lock()
        self._payload = {
            "resource_exhaustion_metrics": {
                "sse_flood": {
                    "connections_opened": 0,
                    "connections_failed": 0,
                    "connections_closed": 0,
                    "flood_tests": []
                },
                "memory_leak": {
                    "operations_successful": 0,
                    "operations_failed": 0,
                    "snapshots": [],
                    "test_duration": 0,
                    "total_operations": 0
                },
                "redis_saturation": {
                    "tasks_submitted": 0,
                    "submissions_failed": 0,
                    "saturation_tests": [],
                    "errors": []
                },
                "cpu_exhaustion": {
                    "tasks_completed": 0,
                    "tasks_failed": 0,
                    "test_results": [],
                    "errors": []
                }
            },
            "errors": []
        }
    
    def record_sse_connection_opened(self) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["sse_flood"]["connections_opened"] += 1
    
    def record_sse_connection_failed(self, error: str) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["sse_flood"]["connections_failed"] += 1
            self._payload["errors"].append({
                "type": "sse_connection_failed",
                "error": error,
                "timestamp": time.time()
            })
    
    def record_sse_connections_closed(self, count: int) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["sse_flood"]["connections_closed"] = count
    
    def record_flood_test_results(self, opened: int, attempted: int) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["sse_flood"]["flood_tests"].append({
                "attempted": attempted,
                "opened": opened,
                "success_rate": opened / attempted if attempted > 0 else 0,
                "timestamp": time.time()
            })
    
    def record_sse_error(self, error: str) -> None:
        with self._lock:
            self._payload["errors"].append({
                "type": "sse_error",
                "error": error,
                "timestamp": time.time()
            })
    
    def record_memory_operation_success(self) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["memory_leak"]["operations_successful"] += 1
    
    def record_memory_operation_failure(self) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["memory_leak"]["operations_failed"] += 1
    
    def record_memory_snapshot(self, operation_count: int, elapsed_time: float) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["memory_leak"]["snapshots"].append({
                "operation_count": operation_count,
                "elapsed_time": elapsed_time,
                "timestamp": time.time()
            })
    
    def record_memory_test_completed(self, total_operations: int, duration: float) -> None:
        with self._lock:
            memory = self._payload["resource_exhaustion_metrics"]["memory_leak"]
            memory["total_operations"] = total_operations
            memory["test_duration"] = duration
    
    def record_memory_error(self, error: str) -> None:
        with self._lock:
            self._payload["errors"].append({
                "type": "memory_error",
                "error": error,
                "timestamp": time.time()
            })
    
    def record_redis_task_submitted(self) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["redis_saturation"]["tasks_submitted"] += 1
    
    def record_redis_submission_failed(self, error: str) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["redis_saturation"]["submissions_failed"] += 1
    
    def record_redis_saturation_results(self, submitted: int, submission_time_ms: float, 
                                    completed: int, running: int, failed: int) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["redis_saturation"]["saturation_tests"].append({
                "submitted": submitted,
                "submission_time_ms": submission_time_ms,
                "completed": completed,
                "running": running,
                "failed": failed,
                "completion_rate": completed / submitted if submitted > 0 else 0,
                "timestamp": time.time()
            })
    
    def record_redis_error(self, error: str) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["redis_saturation"]["errors"].append({
                "error": error,
                "timestamp": time.time()
            })
    
    def record_cpu_task_completed(self, events_processed: int, duration: float) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["cpu_exhaustion"]["tasks_completed"] += 1
    
    def record_cpu_task_failed(self) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["cpu_exhaustion"]["tasks_failed"] += 1
    
    def record_cpu_exhaustion_test_results(self, successful: int, failed: int, duration: float) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["cpu_exhaustion"]["test_results"].append({
                "successful": successful,
                "failed": failed,
                "duration": duration,
                "success_rate": successful / (successful + failed) if (successful + failed) > 0 else 0,
                "timestamp": time.time()
            })
    
    def record_cpu_error(self, error: str) -> None:
        with self._lock:
            self._payload["resource_exhaustion_metrics"]["cpu_exhaustion"]["errors"].append({
                "error": error,
                "timestamp": time.time()
            })
    
    def payload(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._payload))


# Global resource recorder instance
RESOURCE_RECORDER = ResourceRecorder()


@events.quitting.add_listener
def _save_resource_results(environment, **_kwargs):
    """Save resource exhaustion test results."""
    results_path = Path(__file__).resolve().parent / "results" / "resource_exhaustion.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results_path.write_text(json.dumps(RESOURCE_RECORDER.payload(), indent=2), encoding="utf-8")
