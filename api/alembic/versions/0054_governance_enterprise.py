"""Phase 4 — Governance & Enterprise tables.

Revision ID: 0054_governance_enterprise
Revises: 0053_projection_stores
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0054_governance_enterprise"
down_revision = "0053_projection_stores"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_retention_policies",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("data_category", sa.Text(), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default=sa.text("90")),
        sa.Column("action", sa.Text(), nullable=False, server_default=sa.text("'purge'")),
        sa.Column("archive_target", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "data_category", name="pk_event_retention_policies"),
    )

    op.create_table(
        "data_governance_policies",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("classification", sa.Text(), nullable=False, server_default=sa.text("'internal'")),
        sa.Column("allow_erasure", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", name="pk_data_governance_policies"),
    )

    op.create_table(
        "data_governance_policy_log",
        sa.Column("log_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=True),
        sa.Column("change_type", sa.Text(), nullable=False),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("log_id", name="pk_data_governance_policy_log"),
    )
    op.create_index("ix_data_gov_policy_log_scope", "data_governance_policy_log", ["tenant_id", "project_id", "created_at"])

    op.create_table(
        "domain_event_schema_registry",
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("event_version", sa.Integer(), nullable=False),
        sa.Column("schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("backward_compatible_with", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("event_type", "event_version", name="pk_domain_event_schema_registry"),
    )

    op.create_table(
        "siem_export_subscriptions",
        sa.Column("subscription_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("sink_type", sa.Text(), nullable=False),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("export_format", sa.Text(), nullable=False, server_default=sa.text("'jsonl'")),
        sa.Column("secret_token", sa.Text(), nullable=True),
        sa.Column("event_actions", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_pushed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("subscription_id", name="pk_siem_export_subscriptions"),
    )
    op.create_index("ix_siem_export_subscriptions_scope", "siem_export_subscriptions", ["tenant_id", "project_id"])


def downgrade() -> None:
    op.drop_index("ix_siem_export_subscriptions_scope", table_name="siem_export_subscriptions")
    op.drop_table("siem_export_subscriptions")
    op.drop_table("domain_event_schema_registry")
    op.drop_index("ix_data_gov_policy_log_scope", table_name="data_governance_policy_log")
    op.drop_table("data_governance_policy_log")
    op.drop_table("data_governance_policies")
    op.drop_table("event_retention_policies")
