from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from pathlib import Path
from threading import Lock
from typing import Any

from locust import HttpUser, constant, events, task

from .locustfile import _BaseNexusUser, RECORDER, DEFAULT_TIMEOUT_SECONDS


class DatabaseStressUser(_BaseNexusUser):
    """Stress test database connections, concurrent reads/writes, and resource exhaustion."""
    
    weight = 3
    tags = {"database_stress"}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.active_run_ids = []
    
    @task(5)  # 50% of database stress users do concurrent timeline reads
    def concurrent_timeline_reads(self) -> None:
        """Multiple users reading same run timeline simultaneously."""
        # Get a shared run ID or create one
        if not self.active_run_ids:
            self._create_shared_run()
        
        if self.active_run_ids:
            shared_run_id = self.active_run_ids[0]
            headers = self._base_headers()
            
            # Multiple rapid timeline reads to stress database
            for i in range(10):
                resp = self.client.get(
                    f"/api/runs/{shared_run_id}/timeline", 
                    headers=headers,
                    name="db_stress:timeline_read"
                )
                if resp.status_code != 200:
                    RECORDER.record_error(f"timeline_read_failed", f"HTTP {resp.status_code}")
                
                # Small delay to simulate realistic usage
                time.sleep(0.1)
    
    @task(3)  # 30% do rapid run creation
    def rapid_run_creation(self) -> None:
        """Create many runs quickly to test write throughput."""
        headers = self._base_headers()
        
        # Create multiple runs rapidly to stress database writes
        for i in range(5):
            payload = {
                "objective": f"Database stress test run {uuid.uuid4().hex[:8]}: rapid creation test #{i+1}",
                "high_impact": False,
                "token_budget": 1000,
            }
            
            resp = self.client.post(
                "/api/runs/stream",
                headers=headers,
                json=payload,
                stream=True,
                timeout=30,  # Shorter timeout for stress testing
                name="db_stress:run_creation"
            )
            
            if resp.status_code == 200:
                # Just read the first event to get run_id, then close
                for line in resp.iter_lines(decode_unicode=True):
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line.replace("data: ", "", 1))
                            run_id = data.get("run_id")
                            if run_id:
                                self.active_run_ids.append(run_id)
                                break
                        except json.JSONDecodeError:
                            pass
                        break
                resp.close()
            else:
                RECORDER.record_error(f"run_creation_failed", f"HTTP {resp.status_code}")
            
            # Minimal delay between creations
            time.sleep(0.2)
    
    @task(2)  # 20% do connection pool testing
    def connection_pool_stress(self) -> None:
        """Test database connection pool limits with concurrent requests."""
        headers = self._base_headers()
        
        # Simulate many simultaneous API requests
        concurrent_requests = []
        for i in range(20):
            # Mix of different endpoint types
            if i % 3 == 0:
                # Health check
                req = self.client.get("/api/health", name="db_stress:health_check")
            elif i % 3 == 1:
                # Metrics request
                req = self.client.get("/api/metrics", headers=headers, name="db_stress:metrics")
            else:
                # Run list
                req = self.client.get("/api/runs?limit=10", headers=headers, name="db_stress:run_list")
            
            concurrent_requests.append(req)
        
        # Check results
        failed_requests = 0
        for req in concurrent_requests:
            if hasattr(req, 'status_code') and req.status_code >= 500:
                failed_requests += 1
        
        if failed_requests > 5:  # More than 25% failure rate
            RECORDER.record_error("connection_pool_overload", f"{failed_requests}/20 requests failed")
    
    def _create_shared_run(self) -> None:
        """Create a run that multiple users can share for testing."""
        headers = self._base_headers()
        payload = {
            "objective": f"Shared database stress run {uuid.uuid4().hex}: for concurrent testing",
            "high_impact": False,
            "token_budget": 2000,
        }
        
        resp = self.client.post(
            "/api/runs/stream",
            headers=headers,
            json=payload,
            stream=True,
            timeout=60,
            name="db_stress:shared_run_creation"
        )
        
        if resp.status_code == 200:
            # Read events to get run_id
            for line in resp.iter_lines(decode_unicode=True):
                if line.startswith("data: "):
                    try:
                        data = json.loads(line.replace("data: ", "", 1))
                        run_id = data.get("run_id")
                        if run_id:
                            self.active_run_ids.append(run_id)
                            break
                    except json.JSONDecodeError:
                        pass
                elif line.startswith("event: run_finished"):
                    break
            resp.close()


class DatabaseResourceExhaustionUser(_BaseNexusUser):
    """Test database resource exhaustion and recovery."""
    
    weight = 1
    tags = {"database_exhaustion"}
    
    @task
    def memory_leak_detection(self) -> None:
        """Long-running test to detect memory leaks in database operations."""
        headers = self._base_headers()
        start_time = time.perf_counter()
        run_count = 0
        
        # Run for 10 minutes to detect memory growth
        while time.perf_counter() - start_time < 600:  # 10 minutes
            # Create and immediately query runs
            payload = {
                "objective": f"Memory leak test run {uuid.uuid4().hex[:8]}: #{run_count}",
                "high_impact": False,
                "token_budget": 500,
            }
            
            # Create run
            resp = self.client.post(
                "/api/runs/stream",
                headers=headers,
                json=payload,
                stream=True,
                timeout=30,
                name="exhaustion:memory_test_run"
            )
            
            run_id = None
            if resp.status_code == 200:
                # Get run_id from first event
                for line in resp.iter_lines(decode_unicode=True):
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line.replace("data: ", "", 1))
                            run_id = data.get("run_id")
                            if run_id:
                                break
                        except json.JSONDecodeError:
                            pass
                        break
                resp.close()
            
            # Immediately query the run
            if run_id:
                query_resp = self.client.get(
                    f"/api/runs/{run_id}",
                    headers=headers,
                    name="exhaustion:memory_test_query"
                )
                
                if query_resp.status_code != 200:
                    RECORDER.record_error("memory_test_query_failed", f"Run {run_id} query failed")
            
            run_count += 1
            time.sleep(2)  # 2 seconds between operations
        
        RECORDER.record_metric("memory_test_runs_completed", run_count)
    
    @task
    def connection_exhaustion_test(self) -> None:
        """Test database connection exhaustion and recovery."""
        headers = self._base_headers()
        
        # Create many simultaneous connections
        connections = []
        for i in range(50):
            try:
                # Use different endpoint types to stress various connection pools
                if i % 4 == 0:
                    conn = self.client.get("/api/health", name="exhaustion:conn_test_health", timeout=10)
                elif i % 4 == 1:
                    conn = self.client.get("/api/metrics", headers=headers, name="exhaustion:conn_test_metrics", timeout=10)
                elif i % 4 == 2:
                    conn = self.client.get("/api/runs?limit=5", headers=headers, name="exhaustion:conn_test_runs", timeout=10)
                else:
                    # Create a run (more expensive operation)
                    payload = {
                        "objective": f"Connection test {uuid.uuid4().hex[:8]}",
                        "high_impact": False,
                        "token_budget": 500,
                    }
                    conn = self.client.post(
                        "/api/runs/stream",
                        headers=headers,
                        json=payload,
                        stream=True,
                        timeout=15,
                        name="exhaustion:conn_test_create"
                    )
                
                connections.append(conn)
            except Exception as e:
                RECORDER.record_error("connection_creation_failed", str(e))
        
        # Keep connections open for 30 seconds
        time.sleep(30)
        
        # Close all connections
        successful_closes = 0
        for conn in connections:
            try:
                if hasattr(conn, 'close'):
                    conn.close()
                successful_closes += 1
            except Exception as e:
                RECORDER.record_error("connection_close_failed", str(e))
        
        RECORDER.record_metric("connection_exhaustion_test", {
            "attempted": len(connections),
            "closed": successful_closes
        })


# Enhanced recorder for database-specific metrics
class DatabaseRecorder:
    def __init__(self):
        self._lock = Lock()
        self._payload = {
            "database_stress_metrics": {
                "timeline_reads": {"total": 0, "failed": 0},
                "run_creations": {"total": 0, "failed": 0},
                "connection_pool_errors": 0,
                "memory_test_runs": 0,
                "connection_exhaustion_tests": []
            },
            "errors": []
        }
    
    def record_error(self, error_type: str, details: str) -> None:
        with self._lock:
            self._payload["errors"].append({
                "type": error_type,
                "details": details,
                "timestamp": time.time()
            })
    
    def record_metric(self, metric_name: str, value: Any) -> None:
        with self._lock:
            if metric_name == "timeline_read_failed":
                self._payload["database_stress_metrics"]["timeline_reads"]["failed"] += 1
            elif metric_name == "timeline_read_success":
                self._payload["database_stress_metrics"]["timeline_reads"]["total"] += 1
            elif metric_name == "run_creation_failed":
                self._payload["database_stress_metrics"]["run_creations"]["failed"] += 1
            elif metric_name == "run_creation_success":
                self._payload["database_stress_metrics"]["run_creations"]["total"] += 1
            elif metric_name == "connection_pool_overload":
                self._payload["database_stress_metrics"]["connection_pool_errors"] += 1
            elif metric_name == "memory_test_runs_completed":
                self._payload["database_stress_metrics"]["memory_test_runs"] = value
            elif metric_name == "connection_exhaustion_test":
                self._payload["database_stress_metrics"]["connection_exhaustion_tests"].append(value)
    
    def payload(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._payload))


# Global database recorder instance
DB_RECORDER = DatabaseRecorder()


@events.quitting.add_listener
def _save_database_results(environment, **_kwargs):
    """Save database stress test results."""
    results_path = Path(__file__).resolve().parent / "results" / "database_stress.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results_path.write_text(json.dumps(DB_RECORDER.payload(), indent=2), encoding="utf-8")
