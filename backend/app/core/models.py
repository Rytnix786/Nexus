from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RunCreateRequest(BaseModel):
    objective: str = Field(..., min_length=5, max_length=2000)
    high_impact: bool = Field(default=False)
    token_budget: int = Field(default=8000, ge=1000, le=200000)
    uploaded_context: str = Field(default="", max_length=100000)


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    reviewer: str = Field(..., min_length=2, max_length=120)
    notes: str = Field(..., min_length=3, max_length=4000)


class StopRunRequest(BaseModel):
    reason: str = Field(default="Stopped by operator", min_length=3, max_length=4000)


class BudgetResumeRequest(BaseModel):
    additional_budget: int = Field(..., ge=500, le=200000)


class TimelineEvent(BaseModel):
    run_id: str
    seq: int
    ts: datetime
    event_type: str
    node: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class RunStatusResponse(BaseModel):
    run_id: str
    status: Literal[
        "created",
        "running",
        "awaiting_human",
        "completed",
        "failed",
        "stopped",
        "rejected",
        "timeout",
        "budget_exhausted",
    ]
    current_node: str
    objective: str
    high_impact: bool
    iteration_count: int
    initial_token_budget: int
    token_budget_remaining: int
    estimated_cost_usd: float = 0.0
    latest_checkpoint_seq: int | None = None
    latest_checkpoint_at: datetime | None = None
    started_at: datetime
    updated_at: datetime
    plan: str = ""
    research_notes: list[str] = Field(default_factory=list)
    analysis: str = ""
    draft: str = ""
    critique: str = ""
    final_output: str = ""
    human_decision: str = ""
    human_reviewer: str = ""
    human_notes: str = ""
    metering_mode: str = "estimated"
    prompt_tokens_total: int = 0
    completion_tokens_total: int = 0
    total_tokens_used: int = 0
    quota_subject: str = ""
    quota_daily_limit: int = 0
    quota_daily_used: int = 0
    output: str = ""


class RunTimelineResponse(BaseModel):
    run_id: str
    status: str
    current_node: str
    initial_token_budget: int
    token_budget_remaining: int
    estimated_cost_usd: float = 0.0
    latest_checkpoint_seq: int | None = None
    latest_checkpoint_at: datetime | None = None
    metering_mode: str = "estimated"
    prompt_tokens_total: int = 0
    completion_tokens_total: int = 0
    total_tokens_used: int = 0
    quota_subject: str = ""
    quota_daily_limit: int = 0
    quota_daily_used: int = 0
    events: list[TimelineEvent]


class RunListResponse(BaseModel):
    runs: list[RunStatusResponse]
    total: int
