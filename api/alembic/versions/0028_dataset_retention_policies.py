"""per-dataset version retention policy (Phase 7 governance)

Revision ID: 0028_dataset_retention
Revises: 0027_webhook_delivery_ack
Create Date: 2026-05-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0028_dataset_retention"
down_revision = "0027_webhook_delivery_ack"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_retention_policies",
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("max_versions", sa.Integer(), nullable=True),
        sa.Column("max_age_days", sa.Integer(), nullable=True),
        sa.Column("protect_referenced", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("dataset_id", name="pk_dataset_retention_policies"),
    )
    op.create_index(
        "ix_dataset_retention_scope",
        "dataset_retention_policies",
        ["tenant_id", "project_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_retention_scope", table_name="dataset_retention_policies")
    op.drop_table("dataset_retention_policies")
