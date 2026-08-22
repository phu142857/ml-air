"""Phase II governance: stakeholders, approval workflow columns, approver role.

Revision ID: 0058_model_governance_phase2
Revises: 0057_model_evaluations
Create Date: 2026-08-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0058_model_governance_phase2"
down_revision = "0057_model_evaluations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_stakeholders",
        sa.Column("stakeholder_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("stakeholder_id", name="pk_model_stakeholders"),
        sa.UniqueConstraint("model_id", "user_id", "role", name="uq_model_stakeholders_model_user_role"),
        sa.CheckConstraint(
            "role IN ('owner', 'reviewer', 'executor', 'approver')",
            name="ck_model_stakeholders_role",
        ),
    )
    op.create_index(
        "ix_model_stakeholders_scope",
        "model_stakeholders",
        ["tenant_id", "project_id", "model_id"],
        unique=False,
    )

    op.add_column("model_versions", sa.Column("reviewed_by", sa.Text(), nullable=True))
    op.add_column("model_versions", sa.Column("approved_by", sa.Text(), nullable=True))

    op.drop_constraint("ck_ura_role", "user_role_assignments", type_="check")
    op.create_check_constraint(
        "ck_ura_role",
        "user_role_assignments",
        "role IN ('maintainer', 'viewer', 'approver')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_ura_role", "user_role_assignments", type_="check")
    op.create_check_constraint(
        "ck_ura_role",
        "user_role_assignments",
        "role IN ('maintainer', 'viewer')",
    )
    op.drop_column("model_versions", "approved_by")
    op.drop_column("model_versions", "reviewed_by")
    op.drop_index("ix_model_stakeholders_scope", table_name="model_stakeholders")
    op.drop_table("model_stakeholders")
