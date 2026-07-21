"""Drop unused runs.training_mode column.

Revision ID: 0040_drop_runs_training_mode
Revises: 0039_phase4_device_id
Create Date: 2026-07-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0040_drop_runs_training_mode"
down_revision = "0039_phase4_device_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("runs", "training_mode")


def downgrade() -> None:
    op.add_column(
        "runs",
        sa.Column("training_mode", sa.Text(), nullable=True, server_default=sa.text("'full'")),
    )
