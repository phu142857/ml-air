"""add source_type and record_count to dataset_versions

Revision ID: 0014_dataset_version_source_type
Revises: 0013_model_governance
Create Date: 2026-05-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0014_dataset_version_source_type"
down_revision = "0013_model_governance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_versions",
        sa.Column("source_type", sa.Text(), nullable=False, server_default=sa.text("'manual_upload'")),
    )
    op.add_column(
        "dataset_versions",
        sa.Column("record_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    # Backfill record_count from current dataset aggregate as a safe compatibility baseline.
    op.execute(
        """
        UPDATE dataset_versions dv
        SET record_count = COALESCE(d.current_size, 0)
        FROM datasets d
        WHERE d.dataset_id = dv.dataset_id
        """
    )

    op.alter_column("dataset_versions", "source_type", server_default=None)
    op.alter_column("dataset_versions", "record_count", server_default=None)


def downgrade() -> None:
    op.drop_column("dataset_versions", "record_count")
    op.drop_column("dataset_versions", "source_type")

