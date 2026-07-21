"""task/run resource usage telemetry (CPU, memory, GPU, disk)

Revision ID: 0032_usage_cost
Revises: 0031_max_concurrent_runs
Create Date: 2026-05-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0032_usage_cost"
down_revision = "0031_max_concurrent_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_usage_samples",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(length=128), nullable=False),
        sa.Column("sampled_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("cpu_percent", sa.Float(), nullable=True),
        sa.Column("memory_mb", sa.Float(), nullable=True),
        sa.Column("gpu_util_percent", sa.Float(), nullable=True),
        sa.Column("gpu_memory_mb", sa.Float(), nullable=True),
    )
    op.create_index("ix_task_usage_samples_task_id", "task_usage_samples", ["task_id"], unique=False)
    op.create_index("ix_task_usage_samples_task_sampled", "task_usage_samples", ["task_id", "sampled_at"], unique=False)

    op.create_table(
        "task_usage",
        sa.Column("task_id", sa.String(length=128), primary_key=True),
        sa.Column("run_id", sa.String(length=128), nullable=False),
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("runtime_seconds", sa.Float(), nullable=True),
        sa.Column("cpu_seconds", sa.Float(), nullable=True),
        sa.Column("memory_rss_peak_kb", sa.Integer(), nullable=True),
        sa.Column("memory_mb_seconds", sa.Float(), nullable=True),
        sa.Column("gpu_seconds", sa.Float(), nullable=True),
        sa.Column("gpu_memory_mb_seconds", sa.Float(), nullable=True),
        sa.Column("disk_read_bytes", sa.BigInteger(), nullable=True),
        sa.Column("disk_write_bytes", sa.BigInteger(), nullable=True),
        sa.Column("sample_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("aggregated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("ix_task_usage_run_id", "task_usage", ["run_id"], unique=False)
    op.create_index("ix_task_usage_tenant_project", "task_usage", ["tenant_id", "project_id"], unique=False)

    op.create_table(
        "run_usage",
        sa.Column("run_id", sa.String(length=128), primary_key=True),
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("runtime_seconds", sa.Float(), nullable=True),
        sa.Column("cpu_seconds", sa.Float(), nullable=True),
        sa.Column("memory_rss_peak_kb", sa.Integer(), nullable=True),
        sa.Column("memory_mb_seconds", sa.Float(), nullable=True),
        sa.Column("gpu_seconds", sa.Float(), nullable=True),
        sa.Column("gpu_memory_mb_seconds", sa.Float(), nullable=True),
        sa.Column("disk_read_bytes", sa.BigInteger(), nullable=True),
        sa.Column("disk_write_bytes", sa.BigInteger(), nullable=True),
        sa.Column("task_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("aggregated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("ix_run_usage_tenant_project", "run_usage", ["tenant_id", "project_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_run_usage_tenant_project", table_name="run_usage")
    op.drop_table("run_usage")
    op.drop_index("ix_task_usage_tenant_project", table_name="task_usage")
    op.drop_index("ix_task_usage_run_id", table_name="task_usage")
    op.drop_table("task_usage")
    op.drop_index("ix_task_usage_samples_task_sampled", table_name="task_usage_samples")
    op.drop_index("ix_task_usage_samples_task_id", table_name="task_usage_samples")
    op.drop_table("task_usage_samples")
