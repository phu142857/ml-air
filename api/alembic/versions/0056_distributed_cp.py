"""Phase 6 — Distributed AI Control Plane tables.

Revision ID: 0056_distributed_cp
Revises: 0055_ai_control_plane
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0056_distributed_cp"
down_revision = "0055_ai_control_plane"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dc_regions",
        sa.Column("region_id", sa.Text(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("preference_weight", sa.Numeric(), nullable=False, server_default=sa.text("1")),
        sa.Column("health_status", sa.Text(), nullable=False, server_default=sa.text("'healthy'")),
        sa.Column("failover_region_id", sa.Text(), nullable=True),
        sa.Column("latency_ms_hint", sa.Integer(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("region_id", name="pk_dc_regions"),
        sa.UniqueConstraint("code", name="uq_dc_regions_code"),
    )

    op.create_table(
        "dc_clusters",
        sa.Column("cluster_id", sa.Text(), nullable=False),
        sa.Column("region_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("api_endpoint", sa.Text(), nullable=False),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("capacity", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("health_status", sa.Text(), nullable=False, server_default=sa.text("'unknown'")),
        sa.Column("agent_token", sa.Text(), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("cluster_id", name="pk_dc_clusters"),
    )
    op.create_index("ix_dc_clusters_region", "dc_clusters", ["region_id", "health_status"])

    op.create_table(
        "dc_federations",
        sa.Column("federation_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("parent_federation_id", sa.Text(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=False, server_default=sa.text("'global'")),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("federation_id", name="pk_dc_federations"),
    )

    op.create_table(
        "dc_federation_regions",
        sa.Column("federation_id", sa.Text(), nullable=False),
        sa.Column("region_id", sa.Text(), nullable=False),
        sa.Column("tenant_scope", sa.Text(), nullable=True),
        sa.Column("policy_scope", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("federation_id", "region_id", name="pk_dc_federation_regions"),
    )

    op.create_table(
        "dc_edge_nodes",
        sa.Column("edge_id", sa.Text(), nullable=False),
        sa.Column("cluster_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("deployment_kind", sa.Text(), nullable=False, server_default=sa.text("'edge'")),
        sa.Column("sync_mode", sa.Text(), nullable=False, server_default=sa.text("'online'")),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("edge_id", name="pk_dc_edge_nodes"),
    )

    op.create_table(
        "dc_schedule_placements",
        sa.Column("placement_id", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("region_id", sa.Text(), nullable=False),
        sa.Column("cluster_id", sa.Text(), nullable=False),
        sa.Column("node_pool", sa.Text(), nullable=True),
        sa.Column("node_id", sa.Text(), nullable=True),
        sa.Column("score", sa.Numeric(), nullable=True),
        sa.Column("rationale", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("placement_id", name="pk_dc_schedule_placements"),
    )
    op.create_index("ix_dc_placements_run", "dc_schedule_placements", ["run_id"])

    op.create_table(
        "dc_replication_jobs",
        sa.Column("job_id", sa.Text(), nullable=False),
        sa.Column("source_region_id", sa.Text(), nullable=False),
        sa.Column("target_region_id", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("job_id", name="pk_dc_replication_jobs"),
    )

    op.create_table(
        "dc_dr_snapshots",
        sa.Column("snapshot_id", sa.Text(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("region_id", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("snapshot_id", name="pk_dc_dr_snapshots"),
    )

    op.create_table(
        "dc_identity_trust",
        sa.Column("trust_id", sa.Text(), nullable=False),
        sa.Column("source_domain", sa.Text(), nullable=False),
        sa.Column("target_domain", sa.Text(), nullable=False),
        sa.Column("trust_kind", sa.Text(), nullable=False, server_default=sa.text("'federation'")),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("trust_id", name="pk_dc_identity_trust"),
    )

    op.create_table(
        "dc_extension_points",
        sa.Column("extension_id", sa.Text(), nullable=False),
        sa.Column("point_type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False),
        sa.Column("entrypoint", sa.Text(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("extension_id", name="pk_dc_extension_points"),
    )


def downgrade() -> None:
    op.drop_table("dc_extension_points")
    op.drop_table("dc_identity_trust")
    op.drop_table("dc_dr_snapshots")
    op.drop_table("dc_replication_jobs")
    op.drop_index("ix_dc_placements_run", table_name="dc_schedule_placements")
    op.drop_table("dc_schedule_placements")
    op.drop_table("dc_edge_nodes")
    op.drop_table("dc_federation_regions")
    op.drop_table("dc_federations")
    op.drop_index("ix_dc_clusters_region", table_name="dc_clusters")
    op.drop_table("dc_clusters")
    op.drop_table("dc_regions")
