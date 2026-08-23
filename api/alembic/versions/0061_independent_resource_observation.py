"""Independent cgroup/procfs resource observation (P0).

Revision ID: 0061_independent_observation
Revises: 0060_configuration_entries
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0061_independent_observation"
down_revision = "0060_configuration_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_resource_bindings",
        sa.Column("task_id", sa.String(length=128), primary_key=True),
        sa.Column("run_id", sa.String(length=128), nullable=False),
        sa.Column("worker_id", sa.Text(), nullable=True),
        sa.Column("hostname", sa.Text(), nullable=True),
        sa.Column("pid", sa.Integer(), nullable=True),
        sa.Column("cgroup_path", sa.Text(), nullable=True),
        sa.Column("bound_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_task_resource_bindings_run_id", "task_resource_bindings", ["run_id"], unique=False)

    op.create_table(
        "task_usage_observed",
        sa.Column("task_id", sa.String(length=128), primary_key=True),
        sa.Column("run_id", sa.String(length=128), nullable=False),
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("cpu_time_seconds", sa.Float(), nullable=True),
        sa.Column("memory_mb_peak", sa.Float(), nullable=True),
        sa.Column("cpu_percent_peak", sa.Float(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("observation_source", sa.Text(), nullable=False, server_default=sa.text("'none'")),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_task_usage_observed_run_id", "task_usage_observed", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_task_usage_observed_run_id", table_name="task_usage_observed")
    op.drop_table("task_usage_observed")
    op.drop_index("ix_task_resource_bindings_run_id", table_name="task_resource_bindings")
    op.drop_table("task_resource_bindings")
