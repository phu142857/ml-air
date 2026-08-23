"""Admission ternary queue (P1).

Revision ID: 0062_admission_ternary
Revises: 0061_independent_observation
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0062_admission_ternary"
down_revision = "0061_independent_observation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admission_decisions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("demand", postgresql.JSONB(), nullable=True),
        sa.Column("resource_state", postgresql.JSONB(), nullable=True),
        sa.Column("run_id", sa.Text(), nullable=True),
        sa.Column("deferred_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index(
        "ix_admission_decisions_scope_created",
        "admission_decisions",
        ["tenant_id", "project_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "admission_deferred",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("pipeline_id", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("demand", postgresql.JSONB(), nullable=True),
        sa.Column("resource_state", postgresql.JSONB(), nullable=True),
        sa.Column("create_kwargs", postgresql.JSONB(), nullable=False),
        sa.Column("run_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("admitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_admission_deferred_pending",
        "admission_deferred",
        ["status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_admission_deferred_pending", table_name="admission_deferred")
    op.drop_table("admission_deferred")
    op.drop_index("ix_admission_decisions_scope_created", table_name="admission_decisions")
    op.drop_table("admission_decisions")
