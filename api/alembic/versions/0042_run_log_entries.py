"""Postgres-backed run/task log entries (production log store).

Revision ID: 0042_run_log_entries
Revises: 0041_trace_spans
Create Date: 2026-07-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0042_run_log_entries"
down_revision = "0041_trace_spans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "runs",
        sa.Column("log_sequence", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "run_log_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.Text(), nullable=True),
        sa.Column("trace_id", sa.Text(), nullable=True),
        sa.Column("span_id", sa.Text(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("level", sa.Text(), nullable=False, server_default="INFO"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("tenant_id", sa.Text(), nullable=True),
        sa.Column("project_id", sa.Text(), nullable=True),
        sa.Column("plugin", sa.Text(), nullable=True),
        sa.Column("worker_id", sa.Text(), nullable=True),
        sa.UniqueConstraint("run_id", "sequence", name="uq_run_log_entries_run_sequence"),
    )
    op.create_index("ix_run_log_entries_run_sequence", "run_log_entries", ["run_id", "sequence"])
    op.create_index(
        "ix_run_log_entries_task_sequence",
        "run_log_entries",
        ["task_id", "sequence"],
        postgresql_where=sa.text("task_id IS NOT NULL"),
    )
    op.create_index("ix_run_log_entries_run_ts", "run_log_entries", ["run_id", "ts"])
    op.create_index("ix_run_log_entries_ts", "run_log_entries", ["ts"])


def downgrade() -> None:
    op.drop_index("ix_run_log_entries_ts", table_name="run_log_entries")
    op.drop_index("ix_run_log_entries_run_ts", table_name="run_log_entries")
    op.drop_index("ix_run_log_entries_task_sequence", table_name="run_log_entries")
    op.drop_index("ix_run_log_entries_run_sequence", table_name="run_log_entries")
    op.drop_table("run_log_entries")
    op.drop_column("runs", "log_sequence")
