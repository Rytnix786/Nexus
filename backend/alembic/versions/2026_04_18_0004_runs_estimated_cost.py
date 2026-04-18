"""add estimated cost to runs table

Revision ID: 0004_runs_estimated_cost
Revises: 0003_idempotency_records
Create Date: 2026-04-18
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0004_runs_estimated_cost"
down_revision = "0003_idempotency_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Check if the column already exists (idempotent)
    if "runs" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("runs")}
        if "estimated_cost_usd" not in columns:
            op.add_column(
                "runs",
                sa.Column("estimated_cost_usd", sa.Float(), nullable=False, server_default="0.0"),
            )


def downgrade() -> None:
    # Downgrade: remove the column if it exists (optional for safety)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    
    if "runs" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("runs")}
        if "estimated_cost_usd" in columns:
            op.drop_column("runs", "estimated_cost_usd")
