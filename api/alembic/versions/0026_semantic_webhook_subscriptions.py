"""Semantic webhook subscriptions (per-tenant/project HTTP fan-out)

Revision ID: 0026_semantic_webhook_subscriptions
Revises: 0025_evt_outbox
Create Date: 2026-05-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0026_semantic_webhook_subscriptions"
down_revision = "0025_evt_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semantic_webhook_subscriptions",
        sa.Column("subscription_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("secret_hmac", sa.Text(), nullable=True),
        sa.Column("event_types", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_semantic_webhook_subscriptions_tenant_project",
        "semantic_webhook_subscriptions",
        ["tenant_id", "project_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_semantic_webhook_subscriptions_tenant_project", table_name="semantic_webhook_subscriptions")
    op.drop_table("semantic_webhook_subscriptions")
