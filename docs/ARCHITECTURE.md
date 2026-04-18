# Architecture

This document describes the implemented runtime architecture in Nexus Researcher.

## LangGraph Nodes (Implemented)

Nexus runs through eight execution nodes in the core workflow (plus an internal router node used for edge dispatch).

1. Planner
- Purpose: turn the objective into a compact, actionable plan.
- Inputs: objective, optional uploaded context.
- Output: `plan` text and transition to researcher.
- Notes: cache-aware; emits `plan_created` trace event.

2. Researcher
- Purpose: gather evidence and produce research notes.
- Inputs: objective + plan.
- Output: appended `research_notes` and `retrieved_context` list.
- Notes: runs the 4-stage retrieval path (Tavily -> BM25 -> RRF -> cross-encoder rerank), emits `research_completed`.

3. Analyst
- Purpose: synthesize evidence and decide if context is sufficient.
- Inputs: `research_notes` and reranked context.
- Output: `analysis`, `insufficient_context` boolean, transition decision.
- Notes: if evidence is too thin (`context_source_count < 2` or total text too short), routes to refusal.

4. Refusal
- Purpose: deterministic safety stop for insufficient evidence.
- Inputs: analyst insufficiency signal.
- Output: terminal refusal text (`INSUFFICIENT_CONTEXT...`), status `rejected`, route to finalize.
- Notes: no extra LLM call on this path.

5. Writer
- Purpose: produce structured markdown report sections.
- Inputs: objective + plan + analysis + optional uploaded context.
- Output: `draft`, route to critic or human approval depending on impact flag.
- Notes: continuation pass can run when draft is incomplete.

6. Human Approval
- Purpose: explicit pause/resume checkpoint for high-impact runs.
- Inputs: draft and reviewer decision.
- Output: `awaiting_human` pause or transition to critic/finalize.
- Notes: emits `awaiting_approval` stream event while paused.

7. Critic
- Purpose: evaluate draft quality and decide approve vs revision loop.
- Inputs: objective + plan + analysis + draft.
- Output: `critique`, route to finalize (approved) or writer (revision needed).
- Notes: enforces completeness gate when configured.

8. Finalize
- Purpose: seal terminal run state and materialize final output.
- Inputs: latest draft/status.
- Output: final `run_finished` payload (`completed`, `rejected`, `failed`, etc.).
- Notes: always emits a terminal state record and timeline event.

## Retrieval Pipeline (4 Stages)

The researcher node uses a layered retrieval pipeline rather than a single retrieval primitive.

```text
User Objective
    |
    v
[1] Tavily Web Search
    - fetch candidate web results
    |
    v
[2] BM25 (rank-bm25)
    - lexical ranking over candidate docs
    |
    v
[3] Reciprocal Rank Fusion (RRF, k=60)
    - merge Tavily rank + BM25 rank into one list
    |
    v
[4] Cross-Encoder Rerank
    - score query/document pairs jointly
    |
    v
Top Retrieved Context -> Analyst/Writer
```

Why this matters:
- Tavily gives breadth.
- BM25 catches exact terminology.
- RRF stabilizes mixed ranking signals.
- Cross-encoder improves final relevance precision.

## Why Refusal Is a Graph Node (Not Only a Prompt Rule)

Refusal is implemented as a dedicated node to make it deterministic, auditable, and testable.

Prompt-only refusal has two common problems:
- It is probabilistic and can drift across model/provider changes.
- It is harder to audit because control flow is implicit in generated text.

Node-based refusal gives:
- Explicit routing condition from analyst (`insufficient_context`).
- Zero additional generation on refusal path.
- Traceable event sequence in timeline/checkpoints.

Accuracy evidence from evals:
- Refusal correctness = 0.91 (91.0%) from `evals/example-results.json` (18-case run, 2026-04-15).

## SSE + Last-Event-ID Replay

Streaming uses SSE (`text/event-stream`) with timeline persistence in PostgreSQL. On reconnect, the client can provide `Last-Event-ID` and server-side logic replays events after that sequence floor before resuming execution streams.

```text
Client                    API (SSE)                    DB
  |                           |                         |
  | POST /runs/stream         |                         |
  |-------------------------->| create run              |
  |                           | persist step seq=1..n   |
  |<--------------------------| event: timeline         |
  |<--------------------------| event: timeline         |
  |  (disconnect)             |                         |
  X                           |                         |
  | reconnect + Last-Event-ID: n                        |
  | POST /runs/{id}/resume/...|                         |
  |-------------------------->| query events seq > n    |
  |                           |------------------------>|
  |                           |<------------------------|
  |<--------------------------| replay timeline n+1..k  |
  |<--------------------------| live timeline k+1..     |
  |<--------------------------| event: run_finished     |
```

Implementation notes:
- Stream event types include `run_started`, `timeline`, `awaiting_approval`, `run_finished`.
- Resume and budget-resume paths support replay prelude before continuing.
- Idempotency keys prevent duplicate logical launches/resumes.

## Budget vs Quota (Separated Controls)

Nexus separates per-run budget from per-subject daily quota.

- Budget (`token_budget_remaining`): run-scoped execution guard.
- Quota (`quota_daily_used` / `quota_daily_limit`): account/subject daily governance guard.

Concrete example:
- User `ops_lead` starts Run A with budget 8,000 tokens.
- Run A spends 7,500 tokens and completes. Budget control was local to Run A.
- The same user has a daily quota of 200,000 tokens and has now consumed 7,500 for the day.
- Run B can still start if daily quota remains, with its own independent budget (for example, 4,000).
- If Run B budget hits 0, it becomes `budget_exhausted` and can resume after `resume-budget` top-up.
- If daily quota hits limit first, new launches are blocked even if a run-specific budget would have been positive.
