"""Add additive metadata columns tags and external_refs on dataset_versions

Revision ID: 0024_dataset_version_tags_external_refs
Revises: 0023_readiness_eval_source
Create Date: 2026-05-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0024_dataset_version_tags_external_refs"
down_revision = "0023_readiness_eval_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_versions",
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "dataset_versions",
        sa.Column(
            "external_refs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("dataset_versions", "tags", server_default=None)
    op.alter_column("dataset_versions", "external_refs", server_default=None)


def downgrade() -> None:
    op.drop_column("dataset_versions", "external_refs")
    op.drop_column("dataset_versions", "tags")
