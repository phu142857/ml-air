"""add dataset accumulation buffer table

Revision ID: 0015_dataset_accumulation_buffer
Revises: 0014_dataset_version_source_type
Create Date: 2026-05-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0015_dataset_accumulation_buffer"
down_revision = "0014_dataset_version_source_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_accumulation_buffers",
        sa.Column("buffer_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False, server_default=sa.text("'runtime_feedback'")),
        sa.Column("current_size", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("target_threshold", sa.Integer(), nullable=False, server_default=sa.text("1000")),
        sa.Column("window_status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("buffer_id", name="pk_dataset_accumulation_buffers"),
        sa.UniqueConstraint("tenant_id", "project_id", "dataset_id", name="uq_dataset_accumulation_scope"),
    )
    op.create_index(
        "ix_dataset_accumulation_scope",
        "dataset_accumulation_buffers",
        ["tenant_id", "project_id", "dataset_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_accumulation_scope", table_name="dataset_accumulation_buffers")
    op.drop_table("dataset_accumulation_buffers")

