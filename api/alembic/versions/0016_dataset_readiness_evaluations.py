"""add dataset readiness evaluations table

Revision ID: 0016_dataset_readiness_eval
Revises: 0015_dataset_accumulation_buffer
Create Date: 2026-05-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0016_dataset_readiness_eval"
down_revision = "0015_dataset_accumulation_buffer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_readiness_evaluations",
        sa.Column("evaluation_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("dataset_version_id", sa.Text(), sa.ForeignKey("dataset_versions.version_id", ondelete="SET NULL"), nullable=True),
        sa.Column("required_size", sa.Integer(), nullable=False),
        sa.Column("current_size", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("reasons", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.PrimaryKeyConstraint("evaluation_id", name="pk_dataset_readiness_evaluations"),
    )
    op.create_index(
        "ix_dataset_readiness_eval_scope",
        "dataset_readiness_evaluations",
        ["tenant_id", "project_id", "dataset_id", "evaluated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_readiness_eval_scope", table_name="dataset_readiness_evaluations")
    op.drop_table("dataset_readiness_evaluations")

