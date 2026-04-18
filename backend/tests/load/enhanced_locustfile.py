from __future__ import annotations

import json
import os
import time
import uuid
import random
from collections import defaultdict
from pathlib import Path
from threading import Lock
from typing import Any

from locust import HttpUser, between, constant, events, task

# Import all test modules
from .locustfile import _BaseNexusUser, RECORDER, DEFAULT_TIMEOUT_SECONDS
from .database_stress import DatabaseStressUser, DatabaseResourceExhaustionUser
from .upload_stress import FileUploadStressUser, ConcurrentUploadUser, UploadFormatStressUser, UploadExhaustionUser
from .resource_exhaustion import SSEConnectionFloodUser, MemoryLeakDetectionUser, RedisQueueSaturationUser, CPUExhaustionUser
from .metrics_collector import METRICS_COLLECTOR


class RealisticUserBehavior(_BaseNexusUser):
    """Simulate realistic user behavior with proper think times and diverse objectives."""
    
    weight = 5  # 50% of users are realistic users
    tags = {"realistic"}
    
    wait_time = between(2, 8)  # 2-8 seconds between actions (realistic human timing)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.objectives = [
            "Analyze the impact of artificial intelligence on healthcare including diagnostic accuracy and treatment recommendations",
            "Compare cloud provider pricing models for enterprise workloads including hidden costs and scalability factors",
            "Research sustainable energy solutions for data centers including renewable energy integration and efficiency metrics",
            "Evaluate microservices vs monolithic architecture for e-commerce platforms including performance and maintenance considerations",
            "Study blockchain adoption patterns in financial services including regulatory compliance and security challenges",
            "Analyze the latest developments in quantum computing and their practical applications",
            "Research best practices for API security including authentication methods and threat mitigation",
            "Compare database technologies for real-time analytics including performance benchmarks and use cases",
            "Investigate edge computing architectures for IoT deployments including latency optimization and bandwidth management",
            "Examine machine learning model deployment strategies including MLOps pipelines and monitoring approaches"
        ]
        
        self.file_objectives = [
            "Analyze the uploaded document for key insights and recommendations",
            "Extract and summarize the main findings from the provided materials",
            "Compare the uploaded content with industry best practices",
            "Identify trends and patterns in the uploaded data",
            "Generate a comprehensive analysis based on the uploaded documents"
        ]
    
    @task(7)  # 70% of realistic users do normal research
    def normal_research(self) -> None:
        """Perform normal research with realistic objectives and budgets."""
        objective = random.choice(self.objectives)
        
        # Realistic token budgets based on complexity
        if "analyze" in objective.lower() or "evaluate" in objective.lower():
            token_budget = random.randint(2000, 5000)  # Complex analysis
        elif "compare" in objective.lower():
            token_budget = random.randint(1500, 3000)  # Comparison tasks
        elif "research" in objective.lower():
            token_budget = random.randint(1000, 2500)  # Research tasks
        else:
            token_budget = random.randint(500, 1500)  # Simple queries
        
        result, _events_in, err = self._stream_run(
            objective=objective,
            token_budget=token_budget,
            request_name="realistic:normal_research"
        )
        
        if result is None:
            RECORDER.record_error("realistic_research_failed", err)
        else:
            RECORDER.record_success("realistic_research_success")
    
    @task(3)  # 30% upload files and research
    def upload_and_research(self) -> None:
        """Upload a document first, then run research with context."""
        try:
            # First upload a test document
            headers = self._base_headers()
            
            # Generate realistic test content
            content_types = [
                ("test_report.pdf", "application/pdf", b"PDF_REPORT_CONTENT_" + b"X" * 5000),
                ("analysis.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
                 b"DOCX_ANALYSIS_CONTENT_" + b"Y" * 3000),
                ("data_summary.txt", "text/plain", b"TEXT_SUMMARY_CONTENT_" + b"Z" * 2000)
            ]
            
            filename, content_type, content = random.choice(content_types)
            files = {"file": (filename, content, content_type)}
            
            upload_resp = self.client.post(
                "/api/uploads",
                headers=headers,
                files=files,
                name="realistic:file_upload",
                timeout=60
            )
            
            if upload_resp.status_code == 200:
                # Now run research with uploaded context
                objective = random.choice(self.file_objectives)
                result, _events_in, err = self._stream_run(
                    objective=objective,
                    token_budget=random.randint(1500, 3000),
                    request_name="realistic:research_with_file"
                )
                
                if result is None:
                    RECORDER.record_error("realistic_file_research_failed", err)
                else:
                    RECORDER.record_success("realistic_file_research_success")
            else:
                RECORDER.record_error("realistic_file_upload_failed", f"HTTP {upload_resp.status_code}")
                
        except Exception as e:
            RECORDER.record_error("realistic_upload_exception", str(e))


class ProductionLoadUser(_BaseNexusUser):
    """Simulate production load with varied user patterns and realistic timing."""
    
    weight = 3  # 30% of users are production load simulators
    tags = {"production_load"}
    
    wait_time = between(1, 5)  # Faster than realistic users, but still human-like
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.scenarios = [
            ("quick_query", 500, 1000, "Quick factual question"),
            ("medium_research", 1500, 3000, "Medium complexity research"),
            ("complex_analysis", 2500, 5000, "Complex analysis task"),
            ("high_impact", 3000, 8000, "High-impact business query"),
        ]
    
    @task(4)  # 40% quick queries
    def quick_queries(self) -> None:
        """Quick, low-budget queries."""
        scenario_type, min_budget, max_budget, description = self.scenarios[0]
        objective = f"{description} {uuid.uuid4().hex[:8]}"
        token_budget = random.randint(min_budget, max_budget)
        
        result, _events_in, err = self._stream_run(
            objective=objective,
            token_budget=token_budget,
            high_impact=False,
            request_name="production:quick_query"
        )
        
        METRICS_COLLECTOR.record_request("quick_query", time.time(), 200 if result else 500)
    
    @task(3)  # 30% medium research
    def medium_research(self) -> None:
        """Medium complexity research tasks."""
        scenario_type, min_budget, max_budget, description = self.scenarios[1]
        objective = f"{description} {uuid.uuid4().hex[:8]}"
        token_budget = random.randint(min_budget, max_budget)
        
        result, _events_in, err = self._stream_run(
            objective=objective,
            token_budget=token_budget,
            high_impact=False,
            request_name="production:medium_research"
        )
        
        METRICS_COLLECTOR.record_request("medium_research", time.time(), 200 if result else 500)
    
    @task(2)  # 20% complex analysis
    def complex_analysis(self) -> None:
        """Complex analysis tasks."""
        scenario_type, min_budget, max_budget, description = self.scenarios[2]
        objective = f"{description} {uuid.uuid4().hex[:8]}"
        token_budget = random.randint(min_budget, max_budget)
        
        result, _events_in, err = self._stream_run(
            objective=objective,
            token_budget=token_budget,
            high_impact=False,
            request_name="production:complex_analysis"
        )
        
        METRICS_COLLECTOR.record_request("complex_analysis", time.time(), 200 if result else 500)
    
    @task(1)  # 10% high-impact (with approval)
    def high_impact_queries(self) -> None:
        """High-impact queries that require approval."""
        scenario_type, min_budget, max_budget, description = self.scenarios[3]
        objective = f"{description} {uuid.uuid4().hex[:8]}"
        token_budget = random.randint(min_budget, max_budget)
        
        result, _events_in, err = self._stream_run(
            objective=objective,
            token_budget=token_budget,
            high_impact=True,  # Force approval workflow
            request_name="production:high_impact"
        )
        
        METRICS_COLLECTOR.record_request("high_impact", time.time(), 200 if result else 500)


class EnduranceTestUser(_BaseNexusUser):
    """Long-running user for endurance testing (4-6 hours)."""
    
    weight = 1  # Small percentage for endurance testing
    tags = {"endurance"}
    
    wait_time = between(5, 15)  # Slower pace for long-running tests
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.start_time = time.perf_counter()
        self.operation_count = 0
        self.max_duration = 6 * 3600  # 6 hours
    
    @task
    def endurance_operations(self) -> None:
        """Perform operations continuously for extended duration."""
        # Check if we should stop
        if time.perf_counter() - self.start_time > self.max_duration:
            return
        
        self.operation_count += 1
        
        # Vary operations to test different system components
        if self.operation_count % 4 == 0:
            # Health check
            self.client.get("/api/health", name="endurance:health_check")
        elif self.operation_count % 4 == 1:
            # Simple research
            objective = f"Endurance test operation {self.operation_count}: basic research task"
            result, _events_in, err = self._stream_run(
                objective=objective,
                token_budget=1000,
                request_name="endurance:simple_research"
            )
        elif self.operation_count % 4 == 2:
            # Metrics check
            headers = self._base_headers()
            self.client.get("/api/metrics", headers=headers, name="endurance:metrics_check")
        else:
            # Run list
            headers = self._base_headers()
            self.client.get("/api/runs?limit=10", headers=headers, name="endurance:run_list")
        
        # Record endurance metrics
        if self.operation_count % 50 == 0:
            elapsed = time.perf_counter() - self.start_time
            RECORDER.record_endurance_snapshot(self.operation_count, elapsed)


class SpikeLoadUser(_BaseNexusUser):
    """User for simulating traffic spikes."""
    
    weight = 1  # Small percentage, used in specific spike tests
    tags = {"spike_load"}
    
    wait_time = constant(0.1)  # Very fast during spikes
    
    @task
    def spike_operations(self) -> None:
        """Rapid operations during traffic spikes."""
        objective = f"Spike load test {uuid.uuid4().hex[:8]}"
        
        result, _events_in, err = self._stream_run(
            objective=objective,
            token_budget=500,  # Small budget for speed
            request_name="spike:rapid_operation"
        )
        
        METRICS_COLLECTOR.record_request("spike_operation", time.time(), 200 if result else 500)


# Load test profiles configuration
LOAD_PROFILES = {
    "smoke": {
        "description": "Quick smoke test to verify basic functionality",
        "users": 10,
        "spawn_rate": 2,
        "run_time": "2m",
        "user_classes": [RealisticUserBehavior]
    },
    "light": {
        "description": "Light load for baseline performance",
        "users": 50,
        "spawn_rate": 5,
        "run_time": "10m",
        "user_classes": [RealisticUserBehavior, ProductionLoadUser]
    },
    "medium": {
        "description": "Medium load for realistic testing",
        "users": 200,
        "spawn_rate": 20,
        "run_time": "15m",
        "user_classes": [RealisticUserBehavior, ProductionLoadUser, DatabaseStressUser]
    },
    "heavy": {
        "description": "Heavy load for stress testing",
        "users": 500,
        "spawn_rate": 50,
        "run_time": "30m",
        "user_classes": [RealisticUserBehavior, ProductionLoadUser, DatabaseStressUser, 
                     FileUploadStressUser, SSEConnectionFloodUser]
    },
    "stress": {
        "description": "Stress test to find system limits",
        "users": 1000,
        "spawn_rate": 100,
        "run_time": "60m",
        "user_classes": [RealisticUserBehavior, ProductionLoadUser, DatabaseStressUser,
                     FileUploadStressUser, SSEConnectionFloodUser, ResourceExhaustionUser]
    },
    "endurance": {
        "description": "Endurance test for memory leak detection",
        "users": 100,
        "spawn_rate": 10,
        "run_time": "6h",
        "user_classes": [EnduranceTestUser, MemoryLeakDetectionUser]
    },
    "spike": {
        "description": "Spike load test for traffic surge handling",
        "users": 100,
        "spawn_rate": 50,
        "run_time": "10m",
        "user_classes": [SpikeLoadUser]
    }
}


def get_load_profile(profile_name: str) -> dict:
    """Get load profile configuration by name."""
    return LOAD_PROFILES.get(profile_name, LOAD_PROFILES["smoke"])


# Enhanced recorder for comprehensive metrics
class EnhancedRecorder:
    """Enhanced recorder that combines all test module metrics."""
    
    def __init__(self):
        self._lock = Lock()
        self._payload = {
            "test_profile": os.getenv("LOCUST_PROFILE", "smoke"),
            "test_metadata": {
                "start_time": None,
                "end_time": None,
                "profile_config": {}
            },
            "combined_metrics": {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "error_types": defaultdict(int),
                "response_times": [],
                "user_actions": defaultdict(int)
            },
            "performance_summary": {},
            "regression_indicators": []
        }
    
    def set_test_profile(self, profile_name: str) -> None:
        """Set the active test profile."""
        with self._lock:
            self._payload["test_profile"] = profile_name
            self._payload["test_metadata"]["profile_config"] = get_load_profile(profile_name)
    
    def record_success(self, action_type: str) -> None:
        with self._lock:
            self._payload["combined_metrics"]["successful_requests"] += 1
            self._payload["combined_metrics"]["user_actions"][action_type] += 1
    
    def record_error(self, error_type: str, details: str) -> None:
        with self._lock:
            self._payload["combined_metrics"]["failed_requests"] += 1
            self._payload["combined_metrics"]["error_types"][error_type] += 1
    
    def record_endurance_snapshot(self, operation_count: int, elapsed_time: float) -> None:
        with self._lock:
            self._payload["combined_metrics"]["user_actions"]["endurance_snapshots"] += 1
    
    def finalize_test(self) -> dict[str, Any]:
        """Generate final test summary."""
        with self._lock:
            total = (self._payload["combined_metrics"]["successful_requests"] + 
                     self._payload["combined_metrics"]["failed_requests"])
            
            if total > 0:
                success_rate = self._payload["combined_metrics"]["successful_requests"] / total
                error_rate = self._payload["combined_metrics"]["failed_requests"] / total
            else:
                success_rate = 0
                error_rate = 0
            
            self._payload["performance_summary"] = {
                "total_requests": total,
                "success_rate": success_rate,
                "error_rate": error_rate,
                "test_duration": time.time() - self._payload["test_metadata"]["start_time"] if self._payload["test_metadata"]["start_time"] else 0,
                "requests_per_second": total / (time.time() - self._payload["test_metadata"]["start_time"]) if self._payload["test_metadata"]["start_time"] else 0
            }
            
            # Check for performance regressions
            if success_rate < 0.95:
                self._payload["regression_indicators"].append({
                    "type": "low_success_rate",
                    "value": success_rate,
                    "threshold": 0.95
                })
            
            if error_rate > 0.05:
                self._payload["regression_indicators"].append({
                    "type": "high_error_rate", 
                    "value": error_rate,
                    "threshold": 0.05
                })
            
            return self._payload


# Global enhanced recorder
ENHANCED_RECORDER = EnhancedRecorder()


@events.test_start.add_listener
def _on_enhanced_test_start(environment, **_kwargs):
    """Initialize enhanced recording."""
    profile_name = os.getenv("LOCUST_PROFILE", "smoke")
    ENHANCED_RECORDER.set_test_profile(profile_name)
    ENHANCED_RECORDER._payload["test_metadata"]["start_time"] = time.time()


@events.quitting.add_listener
def _save_enhanced_results(environment, **_kwargs):
    """Save enhanced test results."""
    final_results = ENHANCED_RECORDER.finalize_test()
    
    # Include system metrics from METRICS_COLLECTOR
    if hasattr(METRICS_COLLECTOR, 'get_performance_summary'):
        final_results["system_metrics"] = METRICS_COLLECTOR.get_performance_summary()
    
    results_path = Path(__file__).resolve().parent / "results" / "enhanced_load_test.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(results_path, 'w') as f:
        json.dump(final_results, f, indent=2, default=str)
    
    print(f"Enhanced load test results saved to: {results_path}")
    print(f"Test profile: {final_results['test_profile']}")
    print(f"Total requests: {final_results['performance_summary']['total_requests']}")
    print(f"Success rate: {final_results['performance_summary']['success_rate']:.2%}")
    print(f"Regression indicators: {len(final_results['regression_indicators'])}")
