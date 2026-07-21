"""Add readiness evaluation source metadata

Revision ID: 0023_readiness_eval_source
Revises: 0022_dataset_source_kind_enum
Create Date: 2026-05-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0023_readiness_eval_source"
down_revision = "0022_dataset_source_kind_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_readiness_evaluations",
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'manual'")),
    )
    # Backfill existing rows as manual (pre-source era).
    op.execute(sa.text("UPDATE dataset_readiness_evaluations SET source = 'manual' WHERE source IS NULL"))
    op.alter_column("dataset_readiness_evaluations", "source", server_default=None)
    op.create_index(
        "ix_dataset_readiness_eval_scope_source_time",
        "dataset_readiness_evaluations",
        ["tenant_id", "project_id", "dataset_id", "source", "evaluated_at"],
        unique=False,
        postgresql_ops={"evaluated_at": "DESC"},
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_readiness_eval_scope_source_time", table_name="dataset_readiness_evaluations")
    op.drop_column("dataset_readiness_evaluations", "source")

