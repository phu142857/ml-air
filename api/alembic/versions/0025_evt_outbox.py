"""Semantic event outbox for durable Redis delivery audit + retry

Revision ID: 0025_evt_outbox
Revises: 0024_dsver_tags_extrefs
Create Date: 2026-05-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0025_evt_outbox"
down_revision = "0024_dsver_tags_extrefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semantic_event_outbox",
        sa.Column("outbox_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("envelope", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("redis_delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_semantic_event_outbox_undelivered",
        "semantic_event_outbox",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("redis_delivered_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_semantic_event_outbox_undelivered", table_name="semantic_event_outbox")
    op.drop_table("semantic_event_outbox")
