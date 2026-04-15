"""baseline schema

Revision ID: 0001_baseline_schema
Revises:
Create Date: 2026-04-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_baseline_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("runs"):
        op.create_table(
            "runs",
            sa.Column("run_id", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column("objective", sa.Text(), nullable=False),
            sa.Column("high_impact", sa.Boolean(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("current_node", sa.String(length=64), nullable=False),
            sa.Column("iteration_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("initial_token_budget", sa.Integer(), nullable=False, server_default="8000"),
            sa.Column("token_budget_remaining", sa.Integer(), nullable=False),
            sa.Column("output", sa.Text(), nullable=False, server_default=""),
            sa.Column("state_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not inspector.has_table("run_events"):
        op.create_table(
            "run_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("run_id", sa.String(length=64), sa.ForeignKey("runs.run_id"), nullable=False),
            sa.Column("seq", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("node", sa.String(length=64), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("data", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("run_id", "seq", name="uq_event_run_seq"),
        )
    existing_run_events_indexes = {idx["name"] for idx in inspector.get_indexes("run_events")}
    if "ix_run_events_run_id" not in existing_run_events_indexes:
        op.create_index("ix_run_events_run_id", "run_events", ["run_id"], unique=False)

    if not inspector.has_table("run_checkpoints"):
        op.create_table(
            "run_checkpoints",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("run_id", sa.String(length=64), sa.ForeignKey("runs.run_id"), nullable=False),
            sa.Column("seq", sa.Integer(), nullable=False),
            sa.Column("node", sa.String(length=64), nullable=False),
            sa.Column("state_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("run_id", "seq", name="uq_checkpoint_run_seq"),
        )
    existing_run_checkpoints_indexes = {idx["name"] for idx in inspector.get_indexes("run_checkpoints")}
    if "ix_run_checkpoints_run_id" not in existing_run_checkpoints_indexes:
        op.create_index("ix_run_checkpoints_run_id", "run_checkpoints", ["run_id"], unique=False)

    if not inspector.has_table("token_usage_ledger"):
        op.create_table(
            "token_usage_ledger",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("run_id", sa.String(length=64), sa.ForeignKey("runs.run_id"), nullable=False),
            sa.Column("seq", sa.Integer(), nullable=False),
            sa.Column("node", sa.String(length=64), nullable=False),
            sa.Column("provider", sa.String(length=64), nullable=False, server_default="ollama"),
            sa.Column("model", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("metering_mode", sa.String(length=32), nullable=False, server_default="estimated"),
            sa.Column("billable", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
    existing_token_indexes = {idx["name"] for idx in inspector.get_indexes("token_usage_ledger")}
    if "ix_token_usage_ledger_run_id" not in existing_token_indexes:
        op.create_index("ix_token_usage_ledger_run_id", "token_usage_ledger", ["run_id"], unique=False)

    if not inspector.has_table("quota_windows"):
        op.create_table(
            "quota_windows",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("subject", sa.String(length=200), nullable=False),
            sa.Column("window_start", sa.DateTime(), nullable=False),
            sa.Column("window_end", sa.DateTime(), nullable=False),
            sa.Column("tokens_used", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("subject", "window_start", "window_end", name="uq_quota_subject_window"),
        )
    existing_quota_indexes = {idx["name"] for idx in inspector.get_indexes("quota_windows")}
    if "ix_quota_windows_subject" not in existing_quota_indexes:
        op.create_index("ix_quota_windows_subject", "quota_windows", ["subject"], unique=False)

    if not inspector.has_table("idempotency_records"):
        op.create_table(
            "idempotency_records",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column("scope", sa.String(length=32), nullable=False),
            sa.Column("idempotency_key_hash", sa.String(length=128), nullable=False),
            sa.Column("run_id", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("current_node", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("response_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("scope", "idempotency_key_hash", name="uq_idempotency_scope_key"),
        )
    existing_idempotency_indexes = {idx["name"] for idx in inspector.get_indexes("idempotency_records")}
    if "ix_idempotency_records_scope" not in existing_idempotency_indexes:
        op.create_index("ix_idempotency_records_scope", "idempotency_records", ["scope"], unique=False)
    if "ix_idempotency_records_key_hash" not in existing_idempotency_indexes:
        op.create_index("ix_idempotency_records_key_hash", "idempotency_records", ["idempotency_key_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_idempotency_records_key_hash", table_name="idempotency_records")
    op.drop_index("ix_idempotency_records_scope", table_name="idempotency_records")
    op.drop_table("idempotency_records")

    op.drop_index("ix_quota_windows_subject", table_name="quota_windows")
    op.drop_table("quota_windows")

    op.drop_index("ix_token_usage_ledger_run_id", table_name="token_usage_ledger")
    op.drop_table("token_usage_ledger")

    op.drop_index("ix_run_checkpoints_run_id", table_name="run_checkpoints")
    op.drop_table("run_checkpoints")

    op.drop_index("ix_run_events_run_id", table_name="run_events")
    op.drop_table("run_events")

    op.drop_table("runs")
