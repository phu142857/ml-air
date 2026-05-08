"""add accumulation strategy and materialization metadata

Revision ID: 0018_accumulation_materialization
Revises: 0017_dataset_training_policy
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0018_accumulation_materialization"
down_revision = "0017_dataset_training_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_accumulation_buffers",
        sa.Column("accumulation_strategy", sa.Text(), nullable=False, server_default=sa.text("'snapshot_on_threshold'")),
    )
    op.add_column("dataset_accumulation_buffers", sa.Column("window_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dataset_accumulation_buffers", sa.Column("window_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "dataset_accumulation_buffers",
        sa.Column("last_materialized_version_id", sa.Text(), sa.ForeignKey("dataset_versions.version_id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "dataset_accumulation_buffers",
        sa.Column("last_materialized_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("dataset_accumulation_buffers", "accumulation_strategy", server_default=None)

    op.add_column(
        "dataset_versions",
        sa.Column("materialized_from_buffer", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "dataset_versions",
        sa.Column("materialization_idempotency_key", sa.Text(), nullable=True),
    )
    op.create_index(
        "uq_dataset_versions_materialization_idempotency_key",
        "dataset_versions",
        ["materialization_idempotency_key"],
        unique=True,
        postgresql_where=sa.text("materialization_idempotency_key IS NOT NULL"),
    )
    op.alter_column("dataset_versions", "materialized_from_buffer", server_default=None)


def downgrade() -> None:
    op.drop_index("uq_dataset_versions_materialization_idempotency_key", table_name="dataset_versions")
    op.drop_column("dataset_versions", "materialization_idempotency_key")
    op.drop_column("dataset_versions", "materialized_from_buffer")
    op.drop_column("dataset_accumulation_buffers", "last_materialized_at")
    op.drop_column("dataset_accumulation_buffers", "last_materialized_version_id")
    op.drop_column("dataset_accumulation_buffers", "window_end")
    op.drop_column("dataset_accumulation_buffers", "window_start")
    op.drop_column("dataset_accumulation_buffers", "accumulation_strategy")
