"""add task resource usage telemetry

Revision ID: 0007_task_resource_usage
Revises: 0006_manifest_key_id
Create Date: 2026-04-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0007_task_resource_usage"
down_revision = "0006_manifest_key_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("cpu_time_seconds", sa.Float(), nullable=True))
    op.add_column("tasks", sa.Column("memory_rss_kb", sa.Integer(), nullable=True))
    op.create_index("ix_tasks_duration_ms", "tasks", ["duration_ms"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_duration_ms", table_name="tasks")
    op.drop_column("tasks", "memory_rss_kb")
    op.drop_column("tasks", "cpu_time_seconds")
    op.drop_column("tasks", "duration_ms")
