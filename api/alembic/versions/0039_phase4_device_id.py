"""Phase 4: per-GPU device_id on usage sample rows.

Revision ID: 0039_phase4_device_id
Revises: 0038_phase3_governance
Create Date: 2026-07-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0039_phase4_device_id"
down_revision = "0038_phase3_governance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("task_usage_samples", sa.Column("device_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("task_usage_samples", "device_id")
