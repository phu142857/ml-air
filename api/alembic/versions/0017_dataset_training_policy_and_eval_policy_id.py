"""add dataset training policies and policy_id on readiness evaluations

Revision ID: 0017_dataset_training_policy
Revises: 0016_dataset_readiness_eval
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0017_dataset_training_policy"
down_revision = "0016_dataset_readiness_eval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_training_policies",
        sa.Column("policy_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_id", sa.Text(), nullable=True),
        sa.Column("required_size", sa.Integer(), nullable=False, server_default=sa.text("1000")),
        sa.Column("freshness_hours", sa.Integer(), nullable=False, server_default=sa.text("24")),
        sa.Column("trigger_mode", sa.Text(), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("validation_rules", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("policy_id", name="pk_dataset_training_policies"),
        sa.UniqueConstraint("tenant_id", "project_id", "dataset_id", "model_id", name="uq_dataset_training_policy_scope"),
    )
    op.create_index(
        "ix_dataset_training_policy_scope",
        "dataset_training_policies",
        ["tenant_id", "project_id", "dataset_id"],
        unique=False,
    )

    op.add_column(
        "dataset_readiness_evaluations",
        sa.Column("policy_id", sa.Text(), sa.ForeignKey("dataset_training_policies.policy_id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index(
        "ix_dataset_readiness_eval_policy",
        "dataset_readiness_evaluations",
        ["policy_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_readiness_eval_policy", table_name="dataset_readiness_evaluations")
    op.drop_column("dataset_readiness_evaluations", "policy_id")
    op.drop_index("ix_dataset_training_policy_scope", table_name="dataset_training_policies")
    op.drop_table("dataset_training_policies")

