"""Phase 5 — AI Control Plane tables.

Revision ID: 0055_ai_control_plane
Revises: 0054_governance_enterprise
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0055_ai_control_plane"
down_revision = "0054_governance_enterprise"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cp_scheduling_policies",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("fairness_weight", sa.Numeric(), nullable=False, server_default=sa.text("1")),
        sa.Column("cost_weight", sa.Numeric(), nullable=False, server_default=sa.text("1")),
        sa.Column("deadline_weight", sa.Numeric(), nullable=False, server_default=sa.text("2")),
        sa.Column("gpu_weight", sa.Numeric(), nullable=False, server_default=sa.text("1")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", name="pk_cp_scheduling_policies"),
    )

    op.create_table(
        "cp_scheduling_metadata",
        sa.Column("run_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("priority_score", sa.Numeric(), nullable=False, server_default=sa.text("0")),
        sa.Column("estimated_cost_usd", sa.Numeric(), nullable=True),
        sa.Column("estimated_runtime_sec", sa.Integer(), nullable=True),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gpu_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("run_id", name="pk_cp_scheduling_metadata"),
    )
    op.create_index("ix_cp_scheduling_meta_scope", "cp_scheduling_metadata", ["tenant_id", "project_id", "priority_score"])

    op.create_table(
        "cp_pricing_rates",
        sa.Column("rate_id", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("rate_usd", sa.Numeric(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("rate_id", name="pk_cp_pricing_rates"),
    )

    op.create_table(
        "cp_chargeback_snapshots",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("period_key", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "period_key", name="pk_cp_chargeback_snapshots"),
    )

    op.create_table(
        "cp_ai_providers",
        sa.Column("provider_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("provider_type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("provider_id", name="pk_cp_ai_providers"),
    )
    op.create_index("ix_cp_ai_providers_scope", "cp_ai_providers", ["tenant_id", "project_id"])

    op.create_table(
        "cp_ai_routes",
        sa.Column("route_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_pattern", sa.Text(), nullable=False),
        sa.Column("provider_id", sa.Text(), nullable=False),
        sa.Column("fallback_provider_id", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("100")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.PrimaryKeyConstraint("route_id", name="pk_cp_ai_routes"),
    )

    op.create_table(
        "cp_prompts",
        sa.Column("prompt_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("prompt_id", name="pk_cp_prompts"),
    )

    op.create_table(
        "cp_prompt_versions",
        sa.Column("version_id", sa.Text(), nullable=False),
        sa.Column("prompt_id", sa.Text(), nullable=False),
        sa.Column("version_num", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("approved_by", sa.Text(), nullable=True),
        sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("version_id", name="pk_cp_prompt_versions"),
    )
    op.create_index("ix_cp_prompt_versions_prompt", "cp_prompt_versions", ["prompt_id", "version_num"])

    op.create_table(
        "cp_eval_datasets",
        sa.Column("dataset_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.PrimaryKeyConstraint("dataset_id", name="pk_cp_eval_datasets"),
    )

    op.create_table(
        "cp_eval_runs",
        sa.Column("eval_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.Text(), nullable=False),
        sa.Column("prompt_version_id", sa.Text(), nullable=True),
        sa.Column("model_ref", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("eval_id", name="pk_cp_eval_runs"),
    )

    op.create_table(
        "cp_marketplace_listings",
        sa.Column("listing_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("visibility", sa.Text(), nullable=False, server_default=sa.text("'project'")),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("listing_id", name="pk_cp_marketplace_listings"),
    )

    op.create_table(
        "cp_automl_jobs",
        sa.Column("job_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("pipeline_id", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.Text(), nullable=True),
        sa.Column("search_space", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("best_run_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("job_id", name="pk_cp_automl_jobs"),
    )

    op.create_table(
        "cp_policy_rules",
        sa.Column("rule_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=False),
        sa.Column("rule_kind", sa.Text(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("rule_id", name="pk_cp_policy_rules"),
    )

    op.create_table(
        "cp_optimization_profiles",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("gpu_packing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("spot_instances", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("autoscaling", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("prewarming", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", name="pk_cp_optimization_profiles"),
    )


def downgrade() -> None:
    op.drop_table("cp_optimization_profiles")
    op.drop_table("cp_policy_rules")
    op.drop_table("cp_automl_jobs")
    op.drop_table("cp_marketplace_listings")
    op.drop_table("cp_eval_runs")
    op.drop_table("cp_eval_datasets")
    op.drop_index("ix_cp_prompt_versions_prompt", table_name="cp_prompt_versions")
    op.drop_table("cp_prompt_versions")
    op.drop_table("cp_prompts")
    op.drop_table("cp_ai_routes")
    op.drop_index("ix_cp_ai_providers_scope", table_name="cp_ai_providers")
    op.drop_table("cp_ai_providers")
    op.drop_table("cp_chargeback_snapshots")
    op.drop_table("cp_pricing_rates")
    op.drop_index("ix_cp_scheduling_meta_scope", table_name="cp_scheduling_metadata")
    op.drop_table("cp_scheduling_metadata")
    op.drop_table("cp_scheduling_policies")
