"""idempotency records

Revision ID: 0003_idempotency_records
Revises: 0002_token_ledger_and_quota
Create Date: 2026-04-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_idempotency_records"
down_revision = "0002_token_ledger_and_quota"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

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
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("idempotency_records")}
    if "ix_idempotency_records_scope" not in existing_indexes:
        op.create_index("ix_idempotency_records_scope", "idempotency_records", ["scope"], unique=False)
    if "ix_idempotency_records_key_hash" not in existing_indexes:
        op.create_index("ix_idempotency_records_key_hash", "idempotency_records", ["idempotency_key_hash"], unique=False)


def downgrade() -> None:
    # Table is part of baseline schema; keep downgrade as no-op for compatibility.
    return
