"""add business validation fields to dataset_versions

Revision ID: 0010_dataset_validation
Revises: 0009_model_trigger_policy
Create Date: 2026-04-28
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_dataset_validation"
down_revision = "0009_model_trigger_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_versions",
        sa.Column("status", sa.Text(), nullable=False, server_default="ready"),
    )
    op.add_column(
        "dataset_versions",
        sa.Column("quality_score", sa.Integer(), nullable=False, server_default="100"),
    )
    op.add_column(
        "dataset_versions",
        sa.Column("summary", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
    )
    op.add_column(
        "dataset_versions",
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("dataset_versions", "details")
    op.drop_column("dataset_versions", "summary")
    op.drop_column("dataset_versions", "quality_score")
    op.drop_column("dataset_versions", "status")
