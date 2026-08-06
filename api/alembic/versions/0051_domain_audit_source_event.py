"""Idempotent Domain Audit inserts keyed by source domain event id.

Revision ID: 0051_domain_audit_source_event
Revises: 0050_domain_event_outbox
Create Date: 2026-08-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0051_domain_audit_source_event"
down_revision = "0050_domain_event_outbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("domain_audit_events", sa.Column("source_domain_event_id", sa.Text(), nullable=True))
    op.create_index(
        "ix_domain_audit_events_source_event",
        "domain_audit_events",
        ["source_domain_event_id"],
        unique=True,
    )
    op.create_table(
        "domain_event_handler_acks",
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("handler_name", sa.Text(), nullable=False),
        sa.Column(
            "acked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("event_id", "handler_name", name="pk_domain_event_handler_acks"),
    )


def downgrade() -> None:
    op.drop_table("domain_event_handler_acks")
    op.drop_index("ix_domain_audit_events_source_event", table_name="domain_audit_events")
    op.drop_column("domain_audit_events", "source_domain_event_id")
