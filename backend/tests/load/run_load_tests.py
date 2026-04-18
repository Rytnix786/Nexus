#!/usr/bin/env python3
"""
Comprehensive Load Test Runner for Nexus Researcher

This script provides easy execution of different load test profiles with proper
environment setup, result collection, and reporting.

Usage:
    python run_load_tests.py --profile smoke
    python run_load_tests.py --profile medium --host http://localhost:8000
    python run_load_tests.py --profile all --sequential
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Run Nexus Researcher load tests with different profiles",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Available Profiles:
  smoke     - Quick smoke test (10 users, 2m)
  light     - Light load (50 users, 10m)  
  medium    - Medium load (200 users, 15m)
  heavy     - Heavy load (500 users, 30m)
  stress    - Stress test (1000 users, 60m)
  endurance - Endurance test (100 users, 6h)
  spike     - Spike load test (100 users, 10m)
  all       - Run all profiles sequentially

Examples:
  python run_load_tests.py --profile smoke
  python run_load_tests.py --profile medium --host http://localhost:8000
  python run_load_tests.py --profile all --sequential --reports-dir ./reports
        """
    )
    
    parser.add_argument(
        "--profile",
        choices=["smoke", "light", "medium", "heavy", "stress", "endurance", "spike", "all"],
        default="smoke",
        help="Load test profile to run"
    )
    
    parser.add_argument(
        "--host",
        default="http://127.0.0.1:8000",
        help="Target host for load testing"
    )
    
    parser.add_argument(
        "--locust-file",
        default="enhanced_locustfile.py",
        choices=["locustfile.py", "enhanced_locustfile.py"],
        help="Locust file to use"
    )
    
    parser.add_argument(
        "--sequential",
        action="store_true",
        help="Run profiles sequentially (only used with --profile all)"
    )
    
    parser.add_argument(
        "--reports-dir",
        default="./load_test_reports",
        help="Directory to save test reports"
    )
    
    parser.add_argument(
        "--no-web",
        action="store_true",
        help="Run in headless mode (no web UI)"
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show commands that would be executed without running them"
    )
    
    return parser.parse_args()


def get_profile_config(profile_name: str) -> Dict:
    """Get profile configuration."""
    from enhanced_locustfile import get_load_profile
    return get_load_profile(profile_name)


def check_prerequisites():
    """Check if all prerequisites are met."""
    print("🔍 Checking prerequisites...")
    
    # Check if locust is installed
    try:
        import locust
        print("✅ Locust is installed")
    except ImportError:
        print("❌ Locust is not installed. Install with: pip install locust")
        return False
    
    # Check if psutil is available (for metrics collection)
    try:
        import psutil
        print("✅ psutil is available")
    except ImportError:
        print("⚠️  psutil is not available. System metrics will be limited.")
    
    # Check if target host is accessible
    # This will be checked before each test run
    
    # Check if results directory can be created
    reports_dir = Path("./load_test_reports")
    try:
        reports_dir.mkdir(exist_ok=True)
        print("✅ Reports directory is accessible")
    except Exception as e:
        print(f"❌ Cannot create reports directory: {e}")
        return False
    
    print("✅ All prerequisites checked")
    return True


def run_locust_command(profile_name: str, config: Dict, args) -> bool:
    """Run a single locust command for the given profile."""
    print(f"\n🚀 Starting load test: {profile_name}")
    print(f"📊 Configuration: {config['description']}")
    print(f"👥 Users: {config['users']}")
    print(f"📈 Spawn rate: {config['spawn_rate']}")
    print(f"⏱️  Duration: {config['run_time']}")
    print(f"🌐 Target: {args.host}")
    
    # Set environment variables
    env = os.environ.copy()
    env["LOCUST_PROFILE"] = profile_name
    
    # Build locust command
    cmd = [
        "python", "-m", "locust",
        "-f", args.locust_file,
        "--host", args.host,
        "--users", str(config["users"]),
        "--spawn-rate", str(config["spawn_rate"]),
        "--run-time", config["run_time"]
    ]
    
    if args.no_web:
        cmd.extend(["--headless"])
    
    # Add user classes if using enhanced locustfile
    if args.locust_file == "enhanced_locustfile.py":
        user_classes = ",".join([cls.__name__ for cls in config["user_classes"]])
        cmd.extend(["--user-classes", user_classes])
    
    print(f"🔧 Command: {' '.join(cmd)}")
    
    if args.dry_run:
        print("🔍 DRY RUN - Command not executed")
        return True
    
    try:
        # Run locust command
        start_time = time.time()
        result = subprocess.run(cmd, env=env, capture_output=False, text=True)
        end_time = time.time()
        
        duration = end_time - start_time
        print(f"\n⏱️  Test completed in {duration:.2f} seconds")
        
        if result.returncode == 0:
            print("✅ Load test completed successfully")
            return True
        else:
            print(f"❌ Load test failed with return code: {result.returncode}")
            return False
            
    except KeyboardInterrupt:
        print("\n⚠️  Load test interrupted by user")
        return False
    except Exception as e:
        print(f"❌ Error running load test: {e}")
        return False


def generate_report(test_results: List[Dict], reports_dir: Path):
    """Generate comprehensive HTML report."""
    print("\n📊 Generating comprehensive report...")
    
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Nexus Researcher Load Test Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ background-color: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }}
        .test-result {{ margin: 20px 0; padding: 15px; border-left: 4px solid #ddd; }}
        .success {{ border-left-color: #28a745; }}
        .failure {{ border-left-color: #dc3545; }}
        .warning {{ border-left-color: #ffc107; }}
        .metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }}
        .metric {{ background-color: #f8f9fa; padding: 10px; border-radius: 3px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🔬 Nexus Researcher Load Test Report</h1>
        <p>Generated on: {time.strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>
    
    <h2>📈 Test Results Summary</h2>
    <div class="metrics">
"""
    
    for result in test_results:
        status_class = "success" if result.get("success", False) else "failure"
        if result.get("warnings"):
            status_class = "warning"
            
        html_content += f"""
        <div class="test-result {status_class}">
            <h3>{result['profile']}</h3>
            <p><strong>Status:</strong> {result.get('status', 'Unknown')}</p>
            <p><strong>Duration:</strong> {result.get('duration', 'Unknown')}</p>
            <p><strong>Users:</strong> {result.get('users', 'Unknown')}</p>
            <p><strong>Success Rate:</strong> {result.get('success_rate', 'Unknown')}</p>
            <p><strong>Requests/sec:</strong> {result.get('requests_per_second', 'Unknown')}</p>
        </div>
"""
    
    html_content += """
    </div>
    
    <h2>📋 Detailed Results</h2>
    <table>
        <tr>
            <th>Profile</th>
            <th>Status</th>
            <th>Users</th>
            <th>Duration</th>
            <th>Success Rate</th>
            <th>Requests/sec</th>
            <th>Issues</th>
        </tr>
"""
    
    for result in test_results:
        html_content += f"""
        <tr>
            <td>{result['profile']}</td>
            <td>{result.get('status', 'Unknown')}</td>
            <td>{result.get('users', 'Unknown')}</td>
            <td>{result.get('duration', 'Unknown')}</td>
            <td>{result.get('success_rate', 'Unknown')}</td>
            <td>{result.get('requests_per_second', 'Unknown')}</td>
            <td>{result.get('issues', 'None')}</td>
        </tr>
"""
    
    html_content += """
    </table>
</body>
</html>
"""
    
    report_path = reports_dir / "load_test_report.html"
    with open(report_path, 'w') as f:
        f.write(html_content)
    
    print(f"📄 HTML report generated: {report_path}")
    
    # Also save JSON data
    json_path = reports_dir / "load_test_results.json"
    with open(json_path, 'w') as f:
        json.dump(test_results, f, indent=2, default=str)
    
    print(f"📄 JSON results saved: {json_path}")


def check_host_availability(host: str) -> bool:
    """Check if the target host is available."""
    try:
        import requests
        response = requests.get(f"{host}/api/health", timeout=10)
        return response.status_code == 200
    except Exception:
        return False


def main():
    """Main entry point."""
    args = parse_arguments()
    
    print("🔬 Nexus Researcher Load Test Runner")
    print("=" * 50)
    
    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)
    
    # Check host availability
    print(f"\n🌐 Checking host availability: {args.host}")
    if not check_host_availability(args.host):
        print(f"❌ Host {args.host} is not accessible")
        sys.exit(1)
    print("✅ Host is accessible")
    
    # Create reports directory
    reports_dir = Path(args.reports_dir)
    reports_dir.mkdir(exist_ok=True)
    
    # Determine which profiles to run
    if args.profile == "all":
        profiles = ["smoke", "light", "medium", "heavy", "stress", "endurance", "spike"]
        print(f"\n📋 Running all profiles: {', '.join(profiles)}")
    else:
        profiles = [args.profile]
        print(f"\n📋 Running profile: {args.profile}")
    
    # Run tests
    test_results = []
    
    for profile_name in profiles:
        config = get_profile_config(profile_name)
        
        print(f"\n" + "="*50)
        print(f"🎯 Profile: {profile_name}")
        print(f"📝 Description: {config['description']}")
        print("="*50)
        
        start_time = time.time()
        success = run_locust_command(profile_name, config, args)
        end_time = time.time()
        
        # Collect results (this would be enhanced to read actual metrics from the generated files)
        result = {
            "profile": profile_name,
            "success": success,
            "status": "Success" if success else "Failed",
            "duration": f"{end_time - start_time:.2f}s",
            "users": config["users"],
            "spawn_rate": config["spawn_rate"],
            "run_time": config["run_time"],
            "success_rate": "N/A",  # Would be extracted from results files
            "requests_per_second": "N/A",  # Would be extracted from results files
            "issues": [] if success else ["Test execution failed"]
        }
        
        test_results.append(result)
        
        # If running sequentially and a test fails, ask whether to continue
        if args.sequential and not success:
            response = input(f"\n❌ Profile {profile_name} failed. Continue with next profile? (y/N): ")
            if response.lower() != 'y':
                print("🛑 Stopping test execution")
                break
        
        # Small delay between tests
        if args.sequential and profile_name != profiles[-1]:
            print("\n⏳ Waiting 30 seconds before next profile...")
            time.sleep(30)
    
    # Generate report
    if test_results:
        generate_report(test_results, reports_dir)
        print(f"\n✅ All tests completed. Reports saved to: {reports_dir}")
    else:
        print("\n⚠️  No tests were executed")


if __name__ == "__main__":
    main()
