"""
Tests for cost accumulation in the token write flow.
Proves that run-level cost updates monotonically as token usage is recorded.
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.cost import estimate_cost
from app.db.tables import Base, RunRecord, TokenUsageLedger
from app.db.repository import append_token_usage, get_token_totals


@pytest.fixture
def in_memory_db():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


class TestCostAccumulation:
    """Test cost accumulation as token events are recorded."""

    def test_run_cost_increments_with_token_writes(self, in_memory_db: Session):
        """Test that run cost increases monotonically as token usage is recorded."""
        session = in_memory_db
        
        # Create a run record
        run_id = "test-run-001"
        now = datetime.now(timezone.utc)
        run = RunRecord(
            run_id=run_id,
            objective="Test cost accumulation",
            high_impact=False,
            status="running",
            current_node="test_node",
            token_budget_remaining=10000,
            initial_token_budget=10000,
            started_at=now,
            updated_at=now,
            estimated_cost_usd=0.0,
        )
        session.add(run)
        session.commit()

        # Record first token event (OpenAI GPT-4)
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=1,
            node="planner",
            provider="openai",
            model="gpt-4",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            metering_mode="estimated",
        )
        
        # Fetch the run and verify cost is calculated
        run = session.query(RunRecord).filter_by(run_id=run_id).first()
        expected_cost_1 = estimate_cost("openai", "gpt-4", 1000, 500)
        assert run.estimated_cost_usd == pytest.approx(expected_cost_1, abs=1e-6)
        
        # Record second token event
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=2,
            node="researcher",
            provider="openai",
            model="gpt-4",
            prompt_tokens=2000,
            completion_tokens=1000,
            total_tokens=3000,
            metering_mode="estimated",
        )
        
        # Fetch the run and verify cost accumulates
        run = session.query(RunRecord).filter_by(run_id=run_id).first()
        cost_2 = estimate_cost("openai", "gpt-4", 2000, 1000)
        total_expected_cost = expected_cost_1 + cost_2
        assert run.estimated_cost_usd == pytest.approx(total_expected_cost, abs=1e-6)

    def test_cost_includes_multiple_providers(self, in_memory_db: Session):
        """Test that cost accumulates correctly across different providers."""
        session = in_memory_db
        
        run_id = "test-run-002"
        now = datetime.now(timezone.utc)
        run = RunRecord(
            run_id=run_id,
            objective="Test multi-provider cost",
            high_impact=False,
            status="running",
            current_node="test_node",
            token_budget_remaining=10000,
            initial_token_budget=10000,
            started_at=now,
            updated_at=now,
            estimated_cost_usd=0.0,
        )
        session.add(run)
        session.commit()

        # Record OpenAI GPT-4 usage
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=1,
            node="planner",
            provider="openai",
            model="gpt-4",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            metering_mode="estimated",
        )
        
        # Record Anthropic Claude usage
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=2,
            node="researcher",
            provider="anthropic",
            model="claude-3-sonnet",
            prompt_tokens=2000,
            completion_tokens=1000,
            total_tokens=3000,
            metering_mode="estimated",
        )
        
        # Record Ollama usage (free)
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=3,
            node="analyzer",
            provider="ollama",
            model="llama3.2:1b",
            prompt_tokens=5000,
            completion_tokens=2000,
            total_tokens=7000,
            metering_mode="estimated",
        )
        
        # Verify total cost
        run = session.query(RunRecord).filter_by(run_id=run_id).first()
        gpt4_cost = estimate_cost("openai", "gpt-4", 1000, 500)
        claude_cost = estimate_cost("anthropic", "claude-3-sonnet", 2000, 1000)
        ollama_cost = estimate_cost("ollama", "llama3.2:1b", 5000, 2000)
        expected_total = gpt4_cost + claude_cost + ollama_cost
        
        assert run.estimated_cost_usd == pytest.approx(expected_total, abs=1e-6)
        # Ollama should contribute 0.0
        assert ollama_cost == 0.0

    def test_unknown_model_doesnt_fail_cost_accumulation(self, in_memory_db: Session):
        """Test that unknown models fail-open and don't break cost accumulation."""
        session = in_memory_db
        
        run_id = "test-run-003"
        now = datetime.now(timezone.utc)
        run = RunRecord(
            run_id=run_id,
            objective="Test unknown model cost handling",
            high_impact=False,
            status="running",
            current_node="test_node",
            token_budget_remaining=10000,
            initial_token_budget=10000,
            started_at=now,
            updated_at=now,
            estimated_cost_usd=0.0,
        )
        session.add(run)
        session.commit()

        # Record unknown model usage
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=1,
            node="planner",
            provider="openai",
            model="unknown-future-model",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            metering_mode="estimated",
        )
        
        # Record known model usage after unknown
        append_token_usage(
            session=session,
            run_id=run_id,
            seq=2,
            node="researcher",
            provider="openai",
            model="gpt-4",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            metering_mode="estimated",
        )
        
        # Verify cost only includes known model
        run = session.query(RunRecord).filter_by(run_id=run_id).first()
        expected_cost = estimate_cost("openai", "gpt-4", 1000, 500)
        assert run.estimated_cost_usd == pytest.approx(expected_cost, abs=1e-6)
