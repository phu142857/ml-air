"""Native MLAir trace span store (replaces Tempo for trace explorer).

Revision ID: 0041_trace_spans
Revises: 0040_drop_runs_training_mode
Create Date: 2026-07-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0041_trace_spans"
down_revision = "0040_drop_runs_training_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trace_spans",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("trace_id", sa.String(length=32), nullable=False),
        sa.Column("span_id", sa.String(length=32), nullable=False),
        sa.Column("parent_span_id", sa.String(length=32), nullable=True),
        sa.Column("tenant_id", sa.Text(), nullable=True),
        sa.Column("project_id", sa.Text(), nullable=True),
        sa.Column("service_name", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
        sa.Column("start_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("trace_id", "span_id", name="uq_trace_spans_trace_span"),
    )
    op.create_index("ix_trace_spans_trace_id", "trace_spans", ["trace_id"])
    op.create_index("ix_trace_spans_start_ts", "trace_spans", ["start_ts"])


def downgrade() -> None:
    op.drop_index("ix_trace_spans_start_ts", table_name="trace_spans")
    op.drop_index("ix_trace_spans_trace_id", table_name="trace_spans")
    op.drop_table("trace_spans")
