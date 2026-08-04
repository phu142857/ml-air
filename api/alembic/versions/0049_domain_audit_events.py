"""Add domain_audit_events table for domain-level accountability.

Revision ID: 0049_domain_audit_events
Revises: 0048_trigger_max_parallel
Create Date: 2026-08-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0049_domain_audit_events"
down_revision = "0048_trigger_max_parallel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "domain_audit_events",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("actor_kind", sa.Text(), nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=True),
        sa.Column("actor_name", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=True),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("correlation_id", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_domain_audit_events"),
    )
    op.create_index(
        "ix_domain_audit_events_occurred_at",
        "domain_audit_events",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_domain_audit_events_actor",
        "domain_audit_events",
        ["actor_kind", "actor_id"],
        unique=False,
    )
    op.create_index(
        "ix_domain_audit_events_action",
        "domain_audit_events",
        ["action"],
        unique=False,
    )
    op.create_index(
        "ix_domain_audit_events_target",
        "domain_audit_events",
        ["target_type", "target_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_domain_audit_events_target", table_name="domain_audit_events")
    op.drop_index("ix_domain_audit_events_action", table_name="domain_audit_events")
    op.drop_index("ix_domain_audit_events_actor", table_name="domain_audit_events")
    op.drop_index("ix_domain_audit_events_occurred_at", table_name="domain_audit_events")
    op.drop_table("domain_audit_events")

