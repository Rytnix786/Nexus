from __future__ import annotations

import json
import time
import uuid
import psutil
import threading
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock
from typing import Any

from locust import HttpUser, events


class SystemMetricsCollector:
    """Collect comprehensive system metrics during load testing."""
    
    def __init__(self, collection_interval: float = 5.0):
        self.collection_interval = collection_interval
        self._lock = Lock()
        self._collecting = False
        self._metrics_thread = None
        self._metrics_history = deque(maxlen=1000)  # Keep last 1000 snapshots
        self._start_time = None
        
    def start_collection(self) -> None:
        """Start metrics collection in background thread."""
        with self._lock:
            if not self._collecting:
                self._collecting = True
                self._start_time = time.perf_counter()
                self._metrics_thread = threading.Thread(target=self._collect_loop, daemon=True)
                self._metrics_thread.start()
    
    def stop_collection(self) -> None:
        """Stop metrics collection and return results."""
        with self._lock:
            self._collecting = False
            if self._metrics_thread:
                self._metrics_thread.join(timeout=10)
        
        return self.get_summary()
    
    def _collect_loop(self) -> None:
        """Background thread loop for collecting metrics."""
        while self._collecting:
            try:
                snapshot = self._collect_snapshot()
                with self._lock:
                    self._metrics_history.append(snapshot)
                time.sleep(self.collection_interval)
            except Exception as e:
                print(f"Metrics collection error: {e}")
                time.sleep(self.collection_interval)
    
    def _collect_snapshot(self) -> dict[str, Any]:
        """Collect a single snapshot of system metrics."""
        try:
            # CPU metrics
            cpu_percent = psutil.cpu_percent(interval=0.1)
            cpu_count = psutil.cpu_count()
            cpu_freq = psutil.cpu_freq()
            
            # Memory metrics
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            # Disk metrics
            disk = psutil.disk_usage('/')
            disk_io = psutil.disk_io_counters()
            
            # Network metrics
            network = psutil.net_io_counters()
            
            # Process metrics (for current process)
            process = psutil.Process()
            process_memory = process.memory_info()
            process_cpu = process.cpu_percent()
            
            return {
                "timestamp": time.time(),
                "relative_time": time.perf_counter() - self._start_time if self._start_time else 0,
                "cpu": {
                    "percent": cpu_percent,
                    "count": cpu_count,
                    "freq_current": cpu_freq.current if cpu_freq else None,
                    "freq_min": cpu_freq.min if cpu_freq else None,
                    "freq_max": cpu_freq.max if cpu_freq else None,
                },
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "used": memory.used,
                    "percent": memory.percent,
                    "swap_total": swap.total,
                    "swap_used": swap.used,
                    "swap_percent": swap.percent,
                },
                "disk": {
                    "total": disk.total,
                    "used": disk.used,
                    "free": disk.free,
                    "percent": (disk.used / disk.total) * 100 if disk.total > 0 else 0,
                    "read_bytes": disk_io.read_bytes if disk_io else 0,
                    "write_bytes": disk_io.write_bytes if disk_io else 0,
                    "read_count": disk_io.read_count if disk_io else 0,
                    "write_count": disk_io.write_count if disk_io else 0,
                },
                "network": {
                    "bytes_sent": network.bytes_sent if network else 0,
                    "bytes_recv": network.bytes_recv if network else 0,
                    "packets_sent": network.packets_sent if network else 0,
                    "packets_recv": network.packets_recv if network else 0,
                },
                "process": {
                    "pid": process.pid,
                    "memory_rss": process_memory.rss,
                    "memory_vms": process_memory.vms,
                    "cpu_percent": process_cpu,
                    "num_threads": process.num_threads(),
                    "open_files": len(process.open_files()),
                }
            }
        except Exception as e:
            return {
                "timestamp": time.time(),
                "error": str(e)
            }
    
    def get_summary(self) -> dict[str, Any]:
        """Generate summary statistics from collected metrics."""
        with self._lock:
            if not self._metrics_history:
                return {"error": "No metrics collected"}
            
            # Filter out error snapshots
            valid_snapshots = [s for s in self._metrics_history if "error" not in s]
            
            if not valid_snapshots:
                return {"error": "No valid metrics collected"}
            
            # Calculate statistics
            cpu_values = [s["cpu"]["percent"] for s in valid_snapshots]
            memory_values = [s["memory"]["percent"] for s in valid_snapshots]
            disk_values = [s["disk"]["percent"] for s in valid_snapshots]
            
            return {
                "collection_summary": {
                    "total_snapshots": len(self._metrics_history),
                    "valid_snapshots": len(valid_snapshots),
                    "collection_duration": valid_snapshots[-1]["relative_time"] if valid_snapshots else 0,
                    "collection_interval": self.collection_interval,
                },
                "cpu": {
                    "min": min(cpu_values),
                    "max": max(cpu_values),
                    "avg": sum(cpu_values) / len(cpu_values),
                    "p95": self._percentile(cpu_values, 95),
                    "p99": self._percentile(cpu_values, 99),
                },
                "memory": {
                    "min": min(memory_values),
                    "max": max(memory_values),
                    "avg": sum(memory_values) / len(memory_values),
                    "p95": self._percentile(memory_values, 95),
                    "p99": self._percentile(memory_values, 99),
                },
                "disk": {
                    "min": min(disk_values),
                    "max": max(disk_values),
                    "avg": sum(disk_values) / len(disk_values),
                    "p95": self._percentile(disk_values, 95),
                    "p99": self._percentile(disk_values, 99),
                },
                "peak_resources": {
                    "cpu": max(cpu_values),
                    "memory": max(memory_values),
                    "disk": max(disk_values),
                    "timestamp": valid_snapshots[cpu_values.index(max(cpu_values))]["timestamp"],
                },
                "timeline": list(valid_snapshots),  # Full timeline for detailed analysis
            }
    
    def _percentile(self, values: list[float], percentile: float) -> float:
        """Calculate percentile of values."""
        if not values:
            return 0.0
        sorted_values = sorted(values)
        index = int((percentile / 100) * len(sorted_values))
        if index >= len(sorted_values):
            index = len(sorted_values) - 1
        return sorted_values[index]


class LoadTestMetricsCollector:
    """Enhanced metrics collector for load testing with statistical analysis."""
    
    def __init__(self):
        self._lock = Lock()
        self._metrics = {
            "request_metrics": defaultdict(list),
            "error_metrics": defaultdict(list),
            "timeline_events": [],
            "resource_snapshots": [],
            "test_metadata": {
                "start_time": None,
                "end_time": None,
                "total_users": 0,
                "spawn_rate": 0,
                "test_duration": 0
            }
        }
        self._system_collector = SystemMetricsCollector(collection_interval=2.0)
    
    def start_test(self, users: int, spawn_rate: float) -> None:
        """Initialize metrics collection for a new test."""
        with self._lock:
            self._metrics["test_metadata"].update({
                "start_time": time.time(),
                "total_users": users,
                "spawn_rate": spawn_rate
            })
        self._system_collector.start_collection()
    
    def end_test(self) -> None:
        """Finalize metrics collection."""
        system_summary = self._system_collector.stop_collection()
        with self._lock:
            self._metrics["test_metadata"].update({
                "end_time": time.time(),
                "test_duration": time.time() - self._metrics["test_metadata"]["start_time"]
            })
            self._metrics["resource_snapshots"] = system_summary
    
    def record_request(self, request_type: str, response_time: float, 
                    status_code: int, content_length: int = 0) -> None:
        """Record individual request metrics."""
        with self._lock:
            self._metrics["request_metrics"][request_type].append({
                "timestamp": time.time(),
                "response_time": response_time,
                "status_code": status_code,
                "content_length": content_length,
                "success": 200 <= status_code < 400
            })
    
    def record_error(self, error_type: str, details: str, context: dict = None) -> None:
        """Record error metrics."""
        with self._lock:
            self._metrics["error_metrics"][error_type].append({
                "timestamp": time.time(),
                "details": details,
                "context": context or {}
            })
    
    def record_timeline_event(self, event_type: str, run_id: str, 
                           event_data: dict = None) -> None:
        """Record timeline events for analysis."""
        with self._lock:
            self._metrics["timeline_events"].append({
                "timestamp": time.time(),
                "event_type": event_type,
                "run_id": run_id,
                "event_data": event_data or {}
            })
    
    def get_performance_summary(self) -> dict[str, Any]:
        """Generate comprehensive performance summary."""
        with self._lock:
            summary = {
                "test_metadata": self._metrics["test_metadata"].copy(),
                "request_analysis": {},
                "error_analysis": {},
                "timeline_analysis": {},
                "resource_analysis": self._metrics.get("resource_snapshots", {}),
                "performance_regression_indicators": []
            }
            
            # Analyze request metrics
            for request_type, requests in self._metrics["request_metrics"].items():
                if requests:
                    response_times = [r["response_time"] for r in requests]
                    success_rate = sum(1 for r in requests if r["success"]) / len(requests)
                    
                    summary["request_analysis"][request_type] = {
                        "total_requests": len(requests),
                        "successful_requests": sum(1 for r in requests if r["success"]),
                        "failed_requests": sum(1 for r in requests if not r["success"]),
                        "success_rate": success_rate,
                        "response_time": {
                            "min": min(response_times),
                            "max": max(response_times),
                            "avg": sum(response_times) / len(response_times),
                            "p50": self._percentile(response_times, 50),
                            "p95": self._percentile(response_times, 95),
                            "p99": self._percentile(response_times, 99),
                        },
                        "throughput": len(requests) / (self._metrics["test_metadata"]["test_duration"] or 1)
                    }
                    
                    # Check for performance regressions
                    if summary["request_analysis"][request_type]["response_time"]["p95"] > 5000:  # 5 seconds
                        summary["performance_regression_indicators"].append({
                            "type": "high_p95_latency",
                            "request_type": request_type,
                            "value": summary["request_analysis"][request_type]["response_time"]["p95"],
                            "threshold": 5000
                        })
                    
                    if success_rate < 0.95:  # Less than 95% success rate
                        summary["performance_regression_indicators"].append({
                            "type": "low_success_rate",
                            "request_type": request_type,
                            "value": success_rate,
                            "threshold": 0.95
                        })
            
            # Analyze error metrics
            for error_type, errors in self._metrics["error_metrics"].items():
                if errors:
                    summary["error_analysis"][error_type] = {
                        "total_errors": len(errors),
                        "error_rate": len(errors) / sum(len(reqs) for reqs in self._metrics["request_metrics"].values()),
                        "recent_errors": errors[-10:],  # Last 10 errors
                        "error_patterns": self._analyze_error_patterns(errors)
                    }
            
            # Analyze timeline events
            if self._metrics["timeline_events"]:
                event_types = defaultdict(int)
                for event in self._metrics["timeline_events"]:
                    event_types[event["event_type"]] += 1
                
                summary["timeline_analysis"] = {
                    "total_events": len(self._metrics["timeline_events"]),
                    "event_types": dict(event_types),
                    "events_per_second": len(self._metrics["timeline_events"]) / (self._metrics["test_metadata"]["test_duration"] or 1)
                }
            
            return summary
    
    def _percentile(self, values: list[float], percentile: float) -> float:
        """Calculate percentile of values."""
        if not values:
            return 0.0
        sorted_values = sorted(values)
        index = int((percentile / 100) * len(sorted_values))
        if index >= len(sorted_values):
            index = len(sorted_values) - 1
        return sorted_values[index]
    
    def _analyze_error_patterns(self, errors: list[dict]) -> dict[str, Any]:
        """Analyze patterns in error messages."""
        error_messages = [error["details"] for error in errors]
        
        # Common error patterns
        patterns = {
            "timeout_errors": sum(1 for msg in error_messages if "timeout" in msg.lower()),
            "connection_errors": sum(1 for msg in error_messages if "connection" in msg.lower()),
            "http_5xx_errors": sum(1 for msg in error_messages if any(code in msg for code in ["500", "502", "503", "504"])),
            "http_4xx_errors": sum(1 for msg in error_messages if any(code in msg for code in ["400", "401", "403", "404", "429"])),
            "json_errors": sum(1 for msg in error_messages if "json" in msg.lower()),
        }
        
        return patterns
    
    def save_results(self, output_path: Path) -> None:
        """Save comprehensive metrics results to file."""
        summary = self.get_performance_summary()
        
        # Add raw data for detailed analysis
        summary["raw_data"] = {
            "request_metrics": dict(self._metrics["request_metrics"]),
            "error_metrics": dict(self._metrics["error_metrics"]),
            "timeline_events": self._metrics["timeline_events"]
        }
        
        with open(output_path, 'w') as f:
            json.dump(summary, f, indent=2, default=str)


# Global metrics collector instance
METRICS_COLLECTOR = LoadTestMetricsCollector()


# Locust event handlers
@events.test_start.add_listener
def _on_test_start(environment, **_kwargs):
    """Initialize metrics collection when test starts."""
    users = getattr(environment, 'parsed_options', None)
    if users:
        total_users = getattr(users, 'users', 0)
        spawn_rate = getattr(users, 'spawn_rate', 0.0)
        METRICS_COLLECTOR.start_test(total_users, spawn_rate)


@events.request.add_listener
def _on_request(request_type, name, response_time, response_length, response, **_kwargs):
    """Record request metrics."""
    status_code = getattr(response, 'status_code', 0) if response else 0
    METRICS_COLLECTOR.record_request(name, response_time, status_code, response_length)


@events.test_stop.add_listener
def _on_test_stop(environment, **_kwargs):
    """Finalize metrics collection when test stops."""
    METRICS_COLLECTOR.end_test()
    
    # Save results
    results_path = Path(__file__).resolve().parent / "results" / "enhanced_metrics.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    METRICS_COLLECTOR.save_results(results_path)


class MetricsUser(HttpUser):
    """User class for testing metrics collection functionality."""
    
    wait_time = constant(1.0)
    
    @task
    def test_metrics_collection(self) -> None:
        """Simple task to generate metrics for testing."""
        self.client.get("/api/health", name="metrics_test_health")
        self.client.get("/api/metrics", name="metrics_test_metrics")
