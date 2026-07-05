"""Phase 3 governance: model stage timestamps and dataset version actor.

Revision ID: 0038_phase3_governance
Revises: 0037_usage_observability_v2
Create Date: 2026-07-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0038_phase3_governance"
down_revision = "0037_usage_observability_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_versions",
        sa.Column("stage_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE model_versions SET stage_updated_at = created_at WHERE stage_updated_at IS NULL")

    op.add_column("dataset_versions", sa.Column("created_by", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("dataset_versions", "created_by")
    op.drop_column("model_versions", "stage_updated_at")
