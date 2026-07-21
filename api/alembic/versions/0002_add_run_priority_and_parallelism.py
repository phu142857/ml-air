"""add run priority and parallelism fields

Revision ID: 0002_run_priority_parallel
Revises: 0001_create_runs_tasks
Create Date: 2026-04-24 15:35:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_run_priority_parallel"
down_revision = "0001_create_runs_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("priority", sa.Text(), nullable=False, server_default="normal"))
    op.add_column("runs", sa.Column("max_parallel_tasks", sa.Integer(), nullable=False, server_default="1"))
    op.alter_column("runs", "priority", server_default=None)
    op.alter_column("runs", "max_parallel_tasks", server_default=None)


def downgrade() -> None:
    op.drop_column("runs", "max_parallel_tasks")
    op.drop_column("runs", "priority")
