"""token ledger and quota windows

Revision ID: 0002_token_ledger_and_quota
Revises: 0001_baseline_schema
Create Date: 2026-04-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_token_ledger_and_quota"
down_revision = "0001_baseline_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

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
    if "ix_token_usage_ledger_run_id" not in {idx["name"] for idx in inspector.get_indexes("token_usage_ledger")}:
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
    if "ix_quota_windows_subject" not in {idx["name"] for idx in inspector.get_indexes("quota_windows")}:
        op.create_index("ix_quota_windows_subject", "quota_windows", ["subject"], unique=False)


def downgrade() -> None:
    # Tables are part of baseline schema; keep downgrade as no-op for compatibility.
    return
