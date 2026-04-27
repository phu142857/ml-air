"""model trigger policy per tenant/project/model

Revision ID: 0009_model_trigger_policy
Revises: 0008_run_readiness_core
Create Date: 2026-04-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0009_model_trigger_policy"
down_revision = "0008_run_readiness_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_trigger_policies",
        sa.Column("policy_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_mode", sa.Text(), nullable=False, server_default="manual"),
        sa.Column("debounce_minutes", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("schedule_cron", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index(
        "uq_model_trigger_policy_scope_model",
        "model_trigger_policies",
        ["tenant_id", "project_id", "model_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_model_trigger_policy_scope_model", table_name="model_trigger_policies")
    op.drop_table("model_trigger_policies")
