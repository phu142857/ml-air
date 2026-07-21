"""tenant quotas and per-tenant webhook host allowlist (Phase 7)

Revision ID: 0029_tenant_quotas
Revises: 0028_dataset_retention
Create Date: 2026-05-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0029_tenant_quotas"
down_revision = "0028_dataset_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_quotas",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("max_projects", sa.Integer(), nullable=True),
        sa.Column("max_datasets_per_project", sa.Integer(), nullable=True),
        sa.Column("max_models_per_project", sa.Integer(), nullable=True),
        sa.Column("max_runs_per_project", sa.Integer(), nullable=True),
        sa.Column("max_webhook_subscriptions_per_project", sa.Integer(), nullable=True),
        sa.Column("webhook_allowed_hosts", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("tenant_id", name="pk_tenant_quotas"),
    )


def downgrade() -> None:
    op.drop_table("tenant_quotas")
