"""Revision ID: 0053_projection_stores
Revises: 0052_domain_webhook_subs
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0053_projection_stores"
down_revision = "0052_domain_webhook_subs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projected_timeline_events",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=True),
        sa.Column("resource_id", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source_domain_event_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id", name="pk_projected_timeline_events"),
    )
    op.create_index("ix_projected_timeline_scope_ts", "projected_timeline_events", ["tenant_id", "project_id", "ts"])
    op.create_index(
        "ix_projected_timeline_source_event",
        "projected_timeline_events",
        ["source_domain_event_id"],
        unique=True,
    )

    op.create_table(
        "projected_activity_events",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scope_type", sa.Text(), nullable=False),
        sa.Column("scope_id", sa.Text(), nullable=True),
        sa.Column("verb", sa.Text(), nullable=False),
        sa.Column("actor_kind", sa.Text(), nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=True),
        sa.Column("actor_name", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source_domain_event_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id", name="pk_projected_activity_events"),
    )
    op.create_index("ix_projected_activity_scope_ts", "projected_activity_events", ["tenant_id", "project_id", "ts"])
    op.create_index(
        "ix_projected_activity_source_event",
        "projected_activity_events",
        ["source_domain_event_id"],
        unique=True,
    )

    op.create_table(
        "projected_dashboard_snapshots",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", name="pk_projected_dashboard_snapshots"),
    )

    op.create_table(
        "projected_statistics_daily",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("stat_date", sa.Date(), nullable=False),
        sa.Column("metric_key", sa.Text(), nullable=False),
        sa.Column("metric_value", sa.Numeric(), nullable=False, server_default=sa.text("0")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "stat_date", "metric_key", name="pk_projected_statistics_daily"),
    )

    op.create_table(
        "projected_analytics_rollups",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("window_key", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "category", "window_key", name="pk_projected_analytics_rollups"),
    )

    op.create_table(
        "projection_checkpoints",
        sa.Column("projection_name", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("last_event_id", sa.Text(), nullable=True),
        sa.Column("last_occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("projection_name", "tenant_id", "project_id", name="pk_projection_checkpoints"),
    )

    op.create_table(
        "integration_subscriptions",
        sa.Column("subscription_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("integration_type", sa.Text(), nullable=False),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("secret_hmac", sa.Text(), nullable=True),
        sa.Column("event_actions", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("subscription_id", name="pk_integration_subscriptions"),
    )
    op.create_index("ix_integration_subscriptions_scope", "integration_subscriptions", ["tenant_id", "project_id"])

    op.create_table(
        "notification_channels",
        sa.Column("channel_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("channel_type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("event_actions", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("channel_id", name="pk_notification_channels"),
    )
    op.create_index("ix_notification_channels_scope", "notification_channels", ["tenant_id", "project_id"])

    op.create_table(
        "notification_delivery_ack",
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("channel_id", sa.Text(), nullable=False),
        sa.Column("acked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("event_id", "channel_id", name="pk_notification_delivery_ack"),
    )


def downgrade() -> None:
    op.drop_table("notification_delivery_ack")
    op.drop_index("ix_notification_channels_scope", table_name="notification_channels")
    op.drop_table("notification_channels")
    op.drop_index("ix_integration_subscriptions_scope", table_name="integration_subscriptions")
    op.drop_table("integration_subscriptions")
    op.drop_table("projection_checkpoints")
    op.drop_table("projected_analytics_rollups")
    op.drop_table("projected_statistics_daily")
    op.drop_table("projected_dashboard_snapshots")
    op.drop_index("ix_projected_activity_source_event", table_name="projected_activity_events")
    op.drop_index("ix_projected_activity_scope_ts", table_name="projected_activity_events")
    op.drop_table("projected_activity_events")
    op.drop_index("ix_projected_timeline_source_event", table_name="projected_timeline_events")
    op.drop_index("ix_projected_timeline_scope_ts", table_name="projected_timeline_events")
    op.drop_table("projected_timeline_events")
