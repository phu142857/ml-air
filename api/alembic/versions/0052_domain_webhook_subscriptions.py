"""Per-project HTTP subscriptions for Domain Event webhooks.

Revision ID: 0052_domain_webhook_subs
Revises: 0051_domain_audit_source_event
Create Date: 2026-08-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0052_domain_webhook_subs"
down_revision = "0051_domain_audit_source_event"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alembic stores revision ids in version_num VARCHAR(32); widen before long ids.
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    op.create_table(
        "domain_webhook_subscriptions",
        sa.Column("subscription_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("secret_hmac", sa.Text(), nullable=True),
        sa.Column("event_actions", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("subscription_id", name="pk_domain_webhook_subscriptions"),
    )
    op.create_index(
        "ix_domain_webhook_subscriptions_tenant_project",
        "domain_webhook_subscriptions",
        ["tenant_id", "project_id"],
        unique=False,
    )
    op.create_table(
        "domain_webhook_delivery_ack",
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("subscription_id", sa.Text(), nullable=False),
        sa.Column(
            "acked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("event_id", "subscription_id", name="pk_domain_webhook_delivery_ack"),
    )


def downgrade() -> None:
    op.drop_table("domain_webhook_delivery_ack")
    op.drop_index("ix_domain_webhook_subscriptions_tenant_project", table_name="domain_webhook_subscriptions")
    op.drop_table("domain_webhook_subscriptions")
