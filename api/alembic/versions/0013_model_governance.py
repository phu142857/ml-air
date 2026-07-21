"""model version approval + serving slot assignments

Revision ID: 0013_model_governance
Revises: 0012_model_pipeline_mapping
Create Date: 2026-05-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0013_model_governance"
down_revision = "0012_model_pipeline_mapping"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_versions",
        sa.Column(
            "approval_status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'approved'"),
        ),
    )
    op.add_column("model_versions", sa.Column("approval_reason", sa.Text(), nullable=True))
    op.add_column("model_versions", sa.Column("approval_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("model_versions", "approval_status", server_default=None)

    op.create_table(
        "model_serving_slots",
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("slot", sa.Text(), nullable=False),
        sa.Column(
            "version_id",
            sa.Text(),
            sa.ForeignKey("model_versions.version_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("model_id", "slot", name="pk_model_serving_slots"),
    )
    op.create_index("ix_model_serving_slots_version", "model_serving_slots", ["version_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_model_serving_slots_version", table_name="model_serving_slots")
    op.drop_table("model_serving_slots")
    op.drop_column("model_versions", "approval_updated_at")
    op.drop_column("model_versions", "approval_reason")
    op.drop_column("model_versions", "approval_status")
