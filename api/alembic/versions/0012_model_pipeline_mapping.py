"""model -> default pipeline mapping (source of truth for train routing)

Revision ID: 0012_model_pipeline_mapping
Revises: 0011_task_worker_lease
Create Date: 2026-05-01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0012_model_pipeline_mapping"
down_revision = "0011_task_worker_lease"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_pipeline_mapping",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_id", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "model_id", name="pk_model_pipeline_mapping"),
    )
    op.create_index(
        "ix_model_pipeline_mapping_model",
        "model_pipeline_mapping",
        ["model_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_model_pipeline_mapping_model", table_name="model_pipeline_mapping")
    op.drop_table("model_pipeline_mapping")
