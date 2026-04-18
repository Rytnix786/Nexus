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


class FileUploadStressUser(_BaseNexusUser):
    """Stress test file upload functionality with various sizes and concurrent uploads."""
    
    weight = 2
    tags = {"upload_stress"}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.uploaded_files = []
    
    @task(4)  # 40% of upload tests are small files
    def upload_small_files(self) -> None:
        """Test upload of small files (100KB)."""
        self._upload_test_file(
            size_kb=100,
            filename="small_test.pdf",
            content_type="application/pdf",
            test_name="upload_small"
        )
    
    @task(3)  # 30% are medium files
    def upload_medium_files(self) -> None:
        """Test upload of medium files (1MB)."""
        self._upload_test_file(
            size_kb=1024,
            filename="medium_test.pdf", 
            content_type="application/pdf",
            test_name="upload_medium"
        )
    
    @task(2)  # 20% are large files
    def upload_large_files(self) -> None:
        """Test upload of large files (5MB)."""
        self._upload_test_file(
            size_kb=5120,
            filename="large_test.pdf",
            content_type="application/pdf", 
            test_name="upload_large"
        )
    
    @task(1)  # 10% are very large files
    def upload_huge_files(self) -> None:
        """Test upload of very large files (10MB)."""
        self._upload_test_file(
            size_kb=10240,
            filename="huge_test.pdf",
            content_type="application/pdf",
            test_name="upload_huge"
        )
    
    def _upload_test_file(self, size_kb: int, filename: str, content_type: str, test_name: str) -> None:
        """Upload a test file of specified size."""
        headers = self._base_headers()
        
        # Generate test content
        content = b"x" * (size_kb * 1024)  # Create file of exact size
        
        # Add some variation to make it more realistic
        if size_kb > 100:
            content = content[:len(content)//2] + b"TEST_CONTENT_MARKER" + content[len(content)//2:]
        
        files = {
            "file": (filename, content, content_type)
        }
        
        start_time = time.perf_counter()
        
        try:
            resp = self.client.post(
                "/api/uploads",
                headers=headers,
                files=files,
                name=f"upload_stress:{test_name}",
                timeout=120,  # Longer timeout for large files
                catch_response=True
            )
            
            upload_time = (time.perf_counter() - start_time) * 1000
            
            if resp.status_code == 200:
                resp.success()
                self.uploaded_files.append({
                    "filename": filename,
                    "size_kb": size_kb,
                    "upload_time_ms": round(upload_time, 2),
                    "upload_id": uuid.uuid4().hex[:8]
                })
                UPLOAD_RECORDER.record_upload_success(test_name, size_kb, upload_time)
            else:
                resp.failure(f"Upload failed: HTTP {resp.status_code}")
                UPLOAD_RECORDER.record_upload_failure(test_name, size_kb, f"HTTP {resp.status_code}")
                
        except Exception as e:
            UPLOAD_RECORDER.record_upload_failure(test_name, size_kb, f"Exception: {str(e)}")


class ConcurrentUploadUser(_BaseNexusUser):
    """Test concurrent file uploads to stress the upload system."""
    
    weight = 1
    tags = {"concurrent_upload"}
    
    @task
    def concurrent_uploads(self) -> None:
        """Upload multiple files simultaneously."""
        headers = self._base_headers()
        
        # Prepare multiple files for concurrent upload
        upload_tasks = []
        file_sizes = [100, 500, 1024, 2048]  # KB
        
        for i, size_kb in enumerate(file_sizes):
            content = b"y" * (size_kb * 1024)  # Different content to avoid caching
            files = {
                "file": (f"concurrent_test_{i}.pdf", content, "application/pdf")
            }
            
            task_data = {
                "files": files,
                "headers": headers,
                "name": f"concurrent_upload_{size_kb}kb",
                "size_kb": size_kb
            }
            upload_tasks.append(task_data)
        
        # Execute uploads concurrently
        start_time = time.perf_counter()
        successful_uploads = 0
        failed_uploads = 0
        
        for task_data in upload_tasks:
            try:
                resp = self.client.post(
                    "/api/uploads",
                    headers=task_data["headers"],
                    files=task_data["files"],
                    name=f"concurrent_upload:{task_data['name']}",
                    timeout=180,  # 3 minutes for concurrent uploads
                    catch_response=True
                )
                
                if resp.status_code == 200:
                    successful_uploads += 1
                    resp.success()
                else:
                    failed_uploads += 1
                    resp.failure(f"Concurrent upload failed: HTTP {resp.status_code}")
                    
            except Exception as e:
                failed_uploads += 1
                UPLOAD_RECORDER.record_concurrent_upload_failure(task_data["size_kb"], str(e))
        
        total_time = (time.perf_counter() - start_time) * 1000
        
        UPLOAD_RECORDER.record_concurrent_batch(
            total_files=len(upload_tasks),
            successful=successful_uploads,
            failed=failed_uploads,
            total_time_ms=round(total_time, 2)
        )


class UploadFormatStressUser(_BaseNexusUser):
    """Test upload of different file formats to stress parsing."""
    
    weight = 1
    tags = {"format_stress"}
    
    @task
    def upload_various_formats(self) -> None:
        """Upload different file formats to test parsing stress."""
        formats = [
            ("test.txt", "text/plain", b"This is a test text file for upload stress testing. " * 100),
            ("test.pdf", "application/pdf", b"PDF_CONTENT_MARKER" * 1000),
            ("test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
             b"DOCX_CONTENT_MARKER" * 800),
        ]
        
        for filename, content_type, content in formats:
            headers = self._base_headers()
            files = {
                "file": (filename, content, content_type)
            }
            
            try:
                resp = self.client.post(
                    "/api/uploads",
                    headers=headers,
                    files=files,
                    name=f"format_stress:{filename}",
                    timeout=60,
                    catch_response=True
                )
                
                if resp.status_code == 200:
                    resp.success()
                    UPLOAD_RECORDER.record_format_success(filename, len(content))
                else:
                    resp.failure(f"Format upload failed: HTTP {resp.status_code}")
                    UPLOAD_RECORDER.record_format_failure(filename, f"HTTP {resp.status_code}")
                    
            except Exception as e:
                UPLOAD_RECORDER.record_format_failure(filename, f"Exception: {str(e)}")


class UploadExhaustionUser(_BaseNexusUser):
    """Test upload system exhaustion and recovery."""
    
    weight = 1
    tags = {"upload_exhaustion"}
    
    @task
    def upload_exhaustion_test(self) -> None:
        """Test upload system limits with rapid successive uploads."""
        headers = self._base_headers()
        
        # Rapid uploads to test system limits
        upload_count = 0
        failed_count = 0
        start_time = time.perf_counter()
        
        # Try to upload 50 files rapidly
        for i in range(50):
            content = b"EXHAUSTION_TEST_" + str(i).encode() * 100  # ~1KB each
            files = {
                "file": (f"exhaustion_test_{i}.txt", content, "text/plain")
            }
            
            try:
                resp = self.client.post(
                    "/api/uploads",
                    headers=headers,
                    files=files,
                    name=f"exhaustion_upload_{i}",
                    timeout=30,
                    catch_response=True
                )
                
                upload_count += 1
                
                if resp.status_code == 200:
                    resp.success()
                else:
                    failed_count += 1
                    resp.failure(f"Exhaustion upload failed: HTTP {resp.status_code}")
                    
                    # If we're getting rate limited or server errors, back off
                    if resp.status_code in [429, 500, 502, 503]:
                        time.sleep(5)  # Back off for 5 seconds
                        
            except Exception as e:
                failed_count += 1
                UPLOAD_RECORDER.record_exhaustion_failure(f"upload_{i}", str(e))
            
            # Small delay between uploads
            time.sleep(0.1)
        
        total_time = (time.perf_counter() - start_time) * 1000
        
        UPLOAD_RECORDER.record_exhaustion_test_results(
            total_attempts=upload_count + failed_count,
            successful=upload_count,
            failed=failed_count,
            total_time_ms=round(total_time, 2)
        )


class UploadRecorder:
    """Recorder for upload-specific stress test metrics."""
    
    def __init__(self):
        self._lock = Lock()
        self._payload = {
            "upload_stress_metrics": {
                "uploads_by_size": {
                    "small_100kb": {"count": 0, "success": 0, "failures": 0, "total_time_ms": 0},
                    "medium_1mb": {"count": 0, "success": 0, "failures": 0, "total_time_ms": 0},
                    "large_5mb": {"count": 0, "success": 0, "failures": 0, "total_time_ms": 0},
                    "huge_10mb": {"count": 0, "success": 0, "failures": 0, "total_time_ms": 0}
                },
                "concurrent_uploads": {
                    "total_batches": 0,
                    "total_files": 0,
                    "successful": 0,
                    "failed": 0,
                    "avg_time_ms": 0
                },
                "format_tests": {
                    "txt": {"success": 0, "failures": 0, "total_bytes": 0},
                    "pdf": {"success": 0, "failures": 0, "total_bytes": 0},
                    "docx": {"success": 0, "failures": 0, "total_bytes": 0}
                },
                "exhaustion_tests": [],
                "errors": []
            }
        }
    
    def record_upload_success(self, test_name: str, size_kb: int, time_ms: float) -> None:
        with self._lock:
            size_key = self._get_size_key(size_kb)
            metrics = self._payload["upload_stress_metrics"]["uploads_by_size"][size_key]
            metrics["count"] += 1
            metrics["success"] += 1
            metrics["total_time_ms"] += time_ms
    
    def record_upload_failure(self, test_name: str, size_kb: int, error: str) -> None:
        with self._lock:
            size_key = self._get_size_key(size_kb)
            metrics = self._payload["upload_stress_metrics"]["uploads_by_size"][size_key]
            metrics["count"] += 1
            metrics["failures"] += 1
            self._payload["upload_stress_metrics"]["errors"].append({
                "test": test_name,
                "size_kb": size_kb,
                "error": error,
                "timestamp": time.time()
            })
    
    def record_concurrent_batch(self, total_files: int, successful: int, failed: int, total_time_ms: float) -> None:
        with self._lock:
            concurrent = self._payload["upload_stress_metrics"]["concurrent_uploads"]
            concurrent["total_batches"] += 1
            concurrent["total_files"] += total_files
            concurrent["successful"] += successful
            concurrent["failed"] += failed
            # Update running average
            current_avg = concurrent["avg_time_ms"]
            batch_count = concurrent["total_batches"]
            concurrent["avg_time_ms"] = ((current_avg * (batch_count - 1)) + total_time_ms) / batch_count
    
    def record_format_success(self, filename: str, size_bytes: int) -> None:
        with self._lock:
            format_key = filename.split('.')[-1].lower()
            if format_key in self._payload["upload_stress_metrics"]["format_tests"]:
                metrics = self._payload["upload_stress_metrics"]["format_tests"][format_key]
                metrics["success"] += 1
                metrics["total_bytes"] += size_bytes
    
    def record_format_failure(self, filename: str, error: str) -> None:
        with self._lock:
            format_key = filename.split('.')[-1].lower()
            if format_key in self._payload["upload_stress_metrics"]["format_tests"]:
                self._payload["upload_stress_metrics"]["format_tests"][format_key]["failures"] += 1
            self._payload["upload_stress_metrics"]["errors"].append({
                "test": f"format_{filename}",
                "error": error,
                "timestamp": time.time()
            })
    
    def record_concurrent_upload_failure(self, size_kb: int, error: str) -> None:
        with self._lock:
            self._payload["upload_stress_metrics"]["errors"].append({
                "test": f"concurrent_upload_{size_kb}kb",
                "error": error,
                "timestamp": time.time()
            })
    
    def record_exhaustion_test_results(self, total_attempts: int, successful: int, failed: int, total_time_ms: float) -> None:
        with self._lock:
            self._payload["upload_stress_metrics"]["exhaustion_tests"].append({
                "total_attempts": total_attempts,
                "successful": successful,
                "failed": failed,
                "total_time_ms": total_time,
                "success_rate": successful / total_attempts if total_attempts > 0 else 0,
                "timestamp": time.time()
            })
    
    def record_exhaustion_failure(self, test_name: str, error: str) -> None:
        with self._lock:
            self._payload["upload_stress_metrics"]["errors"].append({
                "test": test_name,
                "error": error,
                "timestamp": time.time()
            })
    
    def _get_size_key(self, size_kb: int) -> str:
        """Map size to appropriate key."""
        if size_kb <= 100:
            return "small_100kb"
        elif size_kb <= 1024:
            return "medium_1mb"
        elif size_kb <= 5120:
            return "large_5mb"
        else:
            return "huge_10mb"
    
    def payload(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._payload))


# Global upload recorder instance
UPLOAD_RECORDER = UploadRecorder()


@events.quitting.add_listener
def _save_upload_results(environment, **_kwargs):
    """Save upload stress test results."""
    results_path = Path(__file__).resolve().parent / "results" / "upload_stress.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results_path.write_text(json.dumps(UPLOAD_RECORDER.payload(), indent=2), encoding="utf-8")
