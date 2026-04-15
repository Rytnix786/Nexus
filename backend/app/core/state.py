from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, TypedDict


RunStatus = Literal[
    "created",
    "running",
    "awaiting_human",
    "completed",
    "failed",
    "rejected",
    "timeout",
    "budget_exhausted",
]


class AgentState(TypedDict):
    run_id: str
    objective: str
    uploaded_context: str
    high_impact: bool
    status: RunStatus
    current_node: str

    plan: str
    research_notes: list[str]
    analysis: str
    draft: str
    critique: str
    final_output: str
    retrieved_context: list[dict[str, Any]]

    iteration_count: int
    max_iterations: int
    initial_token_budget: int
    token_budget_remaining: int
    prompt_tokens_total: int
    completion_tokens_total: int
    total_tokens_used: int
    metering_mode: str
    quota_subject: str
    quota_daily_used: int
    quota_daily_limit: int
    run_deadline_epoch: float

    require_human_approval: bool
    human_decision: str
    human_reviewer: str
    human_notes: str

    insufficient_context: bool
    
    started_at: datetime
    updated_at: datetime
    trace: list[dict[str, Any]]
