"""external worker lease fields on tasks

Revision ID: 0011_task_worker_lease
Revises: 0010_dataset_validation
Create Date: 2026-04-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0011_task_worker_lease"
down_revision = "0010_dataset_validation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("plugin", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("leased_by", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_worker_lease_queue ON tasks (status, plugin, created_at) "
        "WHERE status = 'QUEUED'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_lease_expires_at ON tasks (lease_expires_at) "
        "WHERE lease_expires_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tasks_lease_expires_at")
    op.execute("DROP INDEX IF EXISTS ix_tasks_worker_lease_queue")
    op.drop_column("tasks", "lease_expires_at")
    op.drop_column("tasks", "leased_by")
    op.drop_column("tasks", "plugin")
