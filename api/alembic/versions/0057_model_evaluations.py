"""add model evaluations registry table

Revision ID: 0057_model_evaluations
Revises: 0056_distributed_cp
Create Date: 2026-08-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0057_model_evaluations"
down_revision = "0056_distributed_cp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_evaluations",
        sa.Column("evaluation_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="SET NULL"), nullable=True),
        sa.Column("benchmark_name", sa.Text(), nullable=False, server_default=sa.text("'default'")),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("baseline_version", sa.Integer(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("reasons", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.PrimaryKeyConstraint("evaluation_id", name="pk_model_evaluations"),
    )
    op.create_index(
        "ix_model_eval_scope",
        "model_evaluations",
        ["tenant_id", "project_id", "model_id", "evaluated_at"],
        unique=False,
    )
    op.create_index(
        "ix_model_eval_version",
        "model_evaluations",
        ["model_id", "version", "evaluated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_model_eval_version", table_name="model_evaluations")
    op.drop_index("ix_model_eval_scope", table_name="model_evaluations")
    op.drop_table("model_evaluations")
