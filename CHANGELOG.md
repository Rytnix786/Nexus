# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

### Added
- Demo media slot at README top (`docs/demo.gif`) for portfolio walkthrough embedding.
- Quick Deploy section with Railway one-click deploy badge/link.
- Architecture deep-dive document (`docs/ARCHITECTURE.md`) covering node-level behavior, retrieval pipeline, refusal-node rationale, SSE replay flow, and budget/quota separation.
- Contributor guide (`docs/CONTRIBUTING.md`) with local stack setup, test/eval commands, conventions, and extension workflows for nodes/evals.
- Tech stack documentation entries for OpenTelemetry + Jaeger observability.

### Changed
- README metrics section upgraded to measured-results format with refusal accuracy and average cost-per-run entries.
- README load test quick reference now uses concrete Locust command instead of placeholder comment.
- Tech stack documentation clarifies LLM provider switch behavior for Ollama/OpenAI/Anthropic.
- ADR set updated to reflect final implementation state and traceable runtime behavior.

## [1.0.0] - 2026-04-18

### Added
- Full-stack orchestration runtime with FastAPI backend, React frontend, PostgreSQL persistence, and Redis queueing.
- LangGraph-based multi-step execution flow with planner, researcher, analyst, writer, human approval, critic, refusal, and finalize stages.
- SSE streaming lifecycle for run events (`run_started`, `timeline`, `awaiting_approval`, `run_finished`).
- Run timeline persistence, checkpointing, and resumability after approval and budget top-up.
- Optional Tavily-powered web search integrated in researcher tooling, with fallback mode.
- Token usage ledger and quota accounting with run-scoped budget controls.
- API + UI support for uploads, run listing/filtering, run status/timeline inspection, and stop/resume operations.
- Test infrastructure across backend unit/integration, frontend tests, and Promptfoo eval suite.
- Operational docs for incidents, release checklist, and SLO/alerting.
