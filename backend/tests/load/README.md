# Enhanced Load Testing Suite

This directory contains the comprehensive load testing suite for Nexus Researcher, transformed from cosmetic benchmarks into production-grade stress testing.

## 🚀 Quick Start

### Installation
```bash
# Install required dependencies
pip install locust psutil

# Install additional dependencies for enhanced metrics
pip install requests
```

### Basic Usage
```bash
# Run smoke test (quick verification)
cd backend/tests/load
python run_load_tests.py --profile smoke

# Run medium load test
python run_load_tests.py --profile medium --host http://localhost:8000

# Run all profiles sequentially
python run_load_tests.py --profile all --sequential

# Run with custom reports directory
python run_load_tests.py --profile heavy --reports-dir ./my_reports
```

## 📊 Load Test Profiles

### Smoke Test
- **Purpose**: Quick verification of basic functionality
- **Load**: 10 users, spawn-rate 2, 2 minutes
- **User Classes**: RealisticUserBehavior
- **Use Case**: CI/CD verification, quick health checks

### Light Load
- **Purpose**: Baseline performance measurement
- **Load**: 50 users, spawn-rate 5, 10 minutes
- **User Classes**: RealisticUserBehavior, ProductionLoadUser
- **Use Case**: Daily performance monitoring, regression detection

### Medium Load
- **Purpose**: Realistic production-like testing
- **Load**: 200 users, spawn-rate 20, 15 minutes
- **User Classes**: RealisticUserBehavior, ProductionLoadUser, DatabaseStressUser
- **Use Case**: Pre-deployment validation, capacity planning

### Heavy Load
- **Purpose**: Stress testing to find system limits
- **Load**: 500 users, spawn-rate 50, 30 minutes
- **User Classes**: RealisticUserBehavior, ProductionLoadUser, DatabaseStressUser, FileUploadStressUser, SSEConnectionFloodUser
- **Use Case**: Production readiness validation, scalability testing

### Stress Test
- **Purpose**: Find breaking points and failure modes
- **Load**: 1000 users, spawn-rate 100, 60 minutes
- **User Classes**: All user classes including resource exhaustion tests
- **Use Case**: Extreme load testing, failure analysis

### Endurance Test
- **Purpose**: Memory leak detection and long-term stability
- **Load**: 100 users, spawn-rate 10, 6 hours
- **User Classes**: EnduranceTestUser, MemoryLeakDetectionUser
- **Use Case**: Production deployment validation, memory leak detection

### Spike Test
- **Purpose**: Traffic surge handling capability
- **Load**: 100 users, spawn-rate 50, 10 minutes
- **User Classes**: SpikeLoadUser
- **Use Case**: Flash crowd testing, marketing campaign preparation

## 🏗️ Architecture

### Test Modules

#### Core Modules
- **`locustfile.py`**: Original scenarios (fixed for production use)
- **`enhanced_locustfile.py`**: New comprehensive test scenarios
- **`run_load_tests.py`**: Test runner with profile management

#### Stress Testing Modules
- **`database_stress.py`**: Database connection pool, concurrent reads/writes
- **`upload_stress.py`**: File upload with various sizes and concurrent uploads
- **`resource_exhaustion.py`**: SSE floods, memory leaks, Redis saturation, CPU exhaustion

#### Metrics Collection
- **`metrics_collector.py`**: System metrics, performance analysis, regression detection

### User Classes

#### RealisticUserBehavior
- **Weight**: 50% of total users
- **Think Time**: 2-8 seconds (human-like)
- **Objectives**: Diverse research queries with varying complexity
- **Token Budgets**: 500-5000 tokens based on complexity
- **Features**: File upload + research workflows

#### ProductionLoadUser
- **Weight**: 30% of total users
- **Think Time**: 1-5 seconds
- **Scenarios**: Quick queries, medium research, complex analysis, high-impact approval
- **Token Budgets**: Production-like budgets (500-8000 tokens)

#### DatabaseStressUser
- **Focus**: Database performance under load
- **Tests**: Concurrent timeline reads, rapid run creation, connection pool stress
- **Metrics**: Connection exhaustion, memory leak detection

#### FileUploadStressUser
- **Focus**: File upload system performance
- **Tests**: Small (100KB), medium (1MB), large (5MB), huge (10MB) files
- **Features**: Concurrent uploads, format variety, exhaustion testing

#### ResourceExhaustionUser
- **Focus**: System resource limits
- **Tests**: SSE connection floods, memory leaks, Redis queue saturation, CPU exhaustion
- **Duration**: Extended tests for leak detection

## 📈 Metrics and Analysis

### Collected Metrics

#### System Metrics
- **CPU**: Usage percentage, frequency, core count
- **Memory**: RAM usage, swap usage, process memory
- **Disk**: Usage percentages, I/O operations
- **Network**: Bytes transferred, packet counts
- **Process**: Thread count, file handles, memory footprint

#### Application Metrics
- **Request Metrics**: Response times, success rates, throughput
- **Error Analysis**: Error types, patterns, frequencies
- **Timeline Events**: Event processing rates, bottlenecks
- **Resource Snapshots**: Historical resource usage

#### Performance Indicators
- **Regression Detection**: P95 latency > 5s, success rate < 95%
- **Threshold Alerts**: CPU > 90%, memory > 80%, error rate > 5%
- **Trend Analysis**: Performance degradation over time

### Result Files

#### Enhanced Metrics
```
results/enhanced_metrics.json
├── test_metadata
├── request_analysis
│   ├── response_time (min, max, avg, p50, p95, p99)
│   ├── success_rate
│   └── throughput
├── error_analysis
├── resource_analysis
│   ├── cpu (min, max, avg, p95, p99)
│   ├── memory (min, max, avg, p95, p99)
│   └── peak_resources
└── performance_regression_indicators
```

#### Module-Specific Results
```
results/database_stress.json     # Database stress metrics
results/upload_stress.json       # File upload metrics
results/resource_exhaustion.json  # Resource exhaustion metrics
```

#### HTML Reports
```
load_test_reports/
├── load_test_report.html      # Comprehensive visual report
└── load_test_results.json     # Raw test results
```

## 🎯 Success Criteria

### Performance Targets
- **P95 Response Time**: ≤ 2000ms for normal loads, ≤ 5000ms for stress loads
- **Success Rate**: ≥ 95% for all load levels
- **Throughput**: Scale linearly with user count
- **Resource Usage**: CPU < 80%, Memory < 80% for normal loads

### Regression Detection
- **Latency Regression**: P95 increase > 20% from baseline
- **Success Rate Regression**: Drop below 95%
- **Throughput Regression**: Decrease > 20% from expected
- **Memory Leaks**: Memory growth > 10MB/hour during endurance tests

### Stability Requirements
- **Endurance Tests**: No memory leaks over 6 hours
- **Spike Tests**: Recovery to normal performance within 5 minutes
- **Stress Tests**: Graceful degradation, not catastrophic failure

## 🔧 Configuration

### Environment Variables
```bash
# Target host for load testing
export LOCUST_HOST=http://localhost:8000

# Test profile to run
export LOCUST_PROFILE=medium

# API authentication (if required)
export NEXUS_API_KEY=your_api_key
export NEXUS_BEARER_TOKEN=your_bearer_token

# Test timeouts
export NEXUS_LOCUST_TIMEOUT_SECONDS=300
```

### Advanced Configuration
```python
# Custom load profiles in enhanced_locustfile.py
LOAD_PROFILES = {
    "custom": {
        "description": "Custom test configuration",
        "users": 150,
        "spawn_rate": 15,
        "run_time": "20m",
        "user_classes": [RealisticUserBehavior, ProductionLoadUser]
    }
}
```

## 🚨 Troubleshooting

### Common Issues

#### Host Not Accessible
```
❌ Host http://localhost:8000 is not accessible
```
**Solution**: Ensure the Nexus backend is running and accessible
```bash
# Check if backend is running
curl http://localhost:8000/api/health

# Start backend if needed
cd NEXUS_R_Main
docker compose up -d backend
```

#### Insufficient System Resources
```
❌ Cannot create more connections
❌ Memory allocation failed
```
**Solution**: Monitor system resources and adjust load levels
```bash
# Monitor during test
htop  # CPU and memory
iotop # Disk I/O
netstat -an | grep :8000  # Network connections
```

#### Test Timeouts
```
❌ Test failed due to timeout
```
**Solution**: Increase timeout values or reduce load
```bash
# Increase timeout
export NEXUS_LOCUST_TIMEOUT_SECONDS=600

# Or use lighter profile
python run_load_tests.py --profile light
```

#### Missing Dependencies
```
❌ ModuleNotFoundError: No module named 'psutil'
```
**Solution**: Install missing dependencies
```bash
pip install psutil requests
```

### Performance Issues

#### High Latency
1. Check system resource utilization
2. Verify database performance
3. Examine network latency
4. Review Ollama model performance

#### Low Success Rate
1. Check application logs for errors
2. Verify API authentication
3. Examine rate limiting configuration
4. Review load test configuration

#### Memory Leaks
1. Run endurance tests (6+ hours)
2. Monitor memory growth patterns
3. Check for unclosed connections
4. Review application memory management

## 📊 Interpreting Results

### Key Metrics

#### P95 Response Time
- **< 500ms**: Excellent performance
- **500ms - 2000ms**: Good performance
- **2000ms - 5000ms**: Acceptable under load
- **> 5000ms**: Performance issues

#### Success Rate
- **> 99%**: Excellent reliability
- **95% - 99%**: Good reliability
- **90% - 95%**: Acceptable under stress
- **< 90%**: Reliability issues

#### Throughput
- **Linear Scaling**: System scales well with load
- **Sub-linear Scaling**: Performance degradation under load
- **Plateau**: System limits reached

#### Resource Usage
- **CPU < 70%**: Headroom available
- **CPU 70-90%**: Optimal utilization
- **CPU > 90%**: Resource exhaustion

### Regression Indicators

#### Critical Issues
- **High P95 Latency**: Response times exceeding SLA
- **Low Success Rate**: Reliability below threshold
- **Memory Growth**: Continuous memory increase
- **Error Spikes**: Sudden increase in errors

#### Warning Signs
- **Gradual Slowdown**: Performance degradation over time
- **Resource Creep**: Slow resource usage increase
- **Intermittent Failures**: Periodic error spikes

## 🔄 Continuous Integration

### CI/CD Integration
```yaml
# .github/workflows/load-tests.yml
name: Load Tests
on: [push, pull_request]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install locust psutil requests
      
      - name: Start services
        run: |
          docker compose up -d
      
      - name: Wait for services
        run: |
          sleep 30
      
      - name: Run smoke test
        run: |
          cd backend/tests/load
          python run_load_tests.py --profile smoke --no-web
      
      - name: Run medium load test
        run: |
          python run_load_tests.py --profile medium --no-web
      
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: load-test-results
          path: backend/tests/load/load_test_reports/
```

### Automated Regression Detection
```python
# In your CI pipeline
def check_performance_regression(results):
    """Check for performance regressions."""
    baseline = load_baseline_results()
    
    if results['p95_latency'] > baseline['p95_latency'] * 1.2:
        raise Exception("P95 latency regression detected")
    
    if results['success_rate'] < baseline['success_rate'] * 0.95:
        raise Exception("Success rate regression detected")
    
    return True
```

## 📚 Best Practices

### Test Design
1. **Start Small**: Begin with smoke tests, gradually increase load
2. **Realistic Scenarios**: Use production-like user behavior patterns
3. **Vary Load**: Test different load levels and patterns
4. **Monitor Continuously**: Collect metrics throughout test duration
5. **Validate Results**: Cross-check metrics with expectations

### Execution
1. **Warm-up Period**: Allow system to stabilize before measurements
2. **Gradual Ramp-up**: Increase load gradually to avoid shock
3. **Sustained Load**: Maintain load long enough to reveal issues
4. **Cool-down Period**: Allow system recovery between tests
5. **Multiple Runs**: Repeat tests to ensure consistent results

### Analysis
1. **Statistical Significance**: Ensure sufficient sample sizes
2. **Trend Analysis**: Look for patterns over time
3. **Correlation Analysis**: Relate metrics to system events
4. **Baseline Comparison**: Compare against known good performance
5. **Root Cause Analysis**: Investigate performance issues thoroughly

## 🔮 Future Enhancements

### Planned Features
- **Distributed Load Testing**: Multiple load generators
- **Real-time Monitoring Dashboard**: Live metrics visualization
- **Automated Baseline Management**: Dynamic baseline updates
- **Integration with APM Tools**: New Relic, DataDog integration
- **Predictive Performance**: ML-based performance prediction
- **Chaos Engineering**: Controlled failure injection

### Extensibility
- **Custom User Classes**: Easy addition of new test patterns
- **Plugin Architecture**: Modular test components
- **Configuration Management**: YAML-based test configuration
- **Result Exporters**: Multiple output formats (CSV, InfluxDB, Prometheus)

---

## 📞 Support

For issues with the load testing suite:

1. Check this README for troubleshooting guidance
2. Review test logs for specific error messages
3. Verify system requirements and dependencies
4. Consult the main project documentation

Remember: Good load testing reveals problems, not hides them. Embrace failures as learning opportunities!
