"""Domain Event outbox for durable publish + async dispatch.

Revision ID: 0050_domain_event_outbox
Revises: 0049_domain_audit_events
Create Date: 2026-08-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0050_domain_event_outbox"
down_revision = "0049_domain_audit_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "domain_event_outbox",
        sa.Column("outbox_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("envelope", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("dlq_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("outbox_id", name="pk_domain_event_outbox"),
    )
    op.create_index(
        "ix_domain_event_outbox_undelivered",
        "domain_event_outbox",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("delivered_at IS NULL AND dlq_at IS NULL"),
    )
    op.create_index(
        "ix_domain_event_outbox_tenant_project",
        "domain_event_outbox",
        ["tenant_id", "project_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_domain_event_outbox_tenant_project", table_name="domain_event_outbox")
    op.drop_index("ix_domain_event_outbox_undelivered", table_name="domain_event_outbox")
    op.drop_table("domain_event_outbox")
