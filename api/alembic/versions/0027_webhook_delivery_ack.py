"""Ack rows for at-most-once semantic webhook delivery per (event_id, subscription)

Revision ID: 0027_webhook_delivery_ack
Revises: 0026_webhook_subscriptions
Create Date: 2026-05-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0027_webhook_delivery_ack"
down_revision = "0026_webhook_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semantic_webhook_delivery_ack",
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("subscription_id", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("event_id", "subscription_id", name="pk_semantic_webhook_delivery_ack"),
    )


def downgrade() -> None:
    op.drop_table("semantic_webhook_delivery_ack")
