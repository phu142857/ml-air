"""v0.3: datasets, lineage, pipeline versions, search indexes, task telemetry

Revision ID: 0004_v03_lineage
Revises: 0003_tracking_registry
Create Date: 2026-04-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_v03_lineage"
down_revision = "0003_tracking_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "datasets",
        sa.Column("dataset_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_datasets_scope_name", "datasets", ["tenant_id", "project_id", "name"], unique=True)
    op.create_index("ix_datasets_tenant_project", "datasets", ["tenant_id", "project_id"], unique=False)
    op.execute(
        "CREATE INDEX ix_datasets_name_trgm ON datasets USING gin (name gin_trgm_ops)"
    )

    op.create_table(
        "dataset_versions",
        sa.Column("version_id", sa.Text(), primary_key=True),
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Text(), nullable=False),
        sa.Column("uri", sa.Text(), nullable=True),
        sa.Column("checksum", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_dataset_versions_dataset_version", "dataset_versions", ["dataset_id", "version"], unique=True)
    op.create_index("ix_dataset_versions_in_out_lineage", "dataset_versions", ["dataset_id"], unique=False)

    op.create_table(
        "pipeline_versions",
        sa.Column("version_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("pipeline_id", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index(
        "uq_pipeline_versions_scope_pipe_ver",
        "pipeline_versions",
        ["tenant_id", "project_id", "pipeline_id", "version"],
        unique=True,
    )
    op.create_index("ix_pipeline_versions_scope_pipe", "pipeline_versions", ["tenant_id", "project_id", "pipeline_id"])

    op.add_column("runs", sa.Column("pipeline_version_id", sa.Text(), nullable=True))
    op.add_column("runs", sa.Column("config_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("runs", sa.Column("replay_of_run_id", sa.Text(), nullable=True))
    op.add_column("runs", sa.Column("replay_from_task_id", sa.Text(), nullable=True))
    op.add_column("runs", sa.Column("plugin_name", sa.Text(), nullable=True))
    op.add_column("runs", sa.Column("plugin_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_foreign_key(
        "fk_runs_pipeline_version",
        "runs",
        "pipeline_versions",
        ["pipeline_version_id"],
        ["version_id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_runs_pipeline_version_id", "runs", ["pipeline_version_id"], unique=False)
    op.create_index("ix_runs_status", "runs", ["status"], unique=False)

    op.create_table(
        "lineage_edges",
        sa.Column("edge_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.Text(), nullable=False),
        sa.Column("input_dataset_version_id", sa.Text(), sa.ForeignKey("dataset_versions.version_id", ondelete="CASCADE"), nullable=True),
        sa.Column("output_dataset_version_id", sa.Text(), sa.ForeignKey("dataset_versions.version_id", ondelete="CASCADE"), nullable=True),
        sa.Column("idempotency_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_lineage_edges_idempotency", "lineage_edges", ["idempotency_key"], unique=True)
    op.create_index("ix_lineage_edges_run_id", "lineage_edges", ["run_id"], unique=False)
    op.create_index("ix_lineage_edges_input", "lineage_edges", ["input_dataset_version_id"], unique=False)
    op.create_index("ix_lineage_edges_output", "lineage_edges", ["output_dataset_version_id"], unique=False)

    op.add_column("tasks", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("error_message", sa.Text(), nullable=True))
    op.execute("CREATE INDEX ix_tasks_error_trgm ON tasks USING gin (error_message gin_trgm_ops) WHERE error_message IS NOT NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tasks_error_trgm")
    op.drop_column("tasks", "error_message")
    op.drop_column("tasks", "finished_at")
    op.drop_column("tasks", "started_at")

    op.drop_index("ix_lineage_edges_output", table_name="lineage_edges")
    op.drop_index("ix_lineage_edges_input", table_name="lineage_edges")
    op.drop_index("ix_lineage_edges_run_id", table_name="lineage_edges")
    op.drop_index("uq_lineage_edges_idempotency", table_name="lineage_edges")
    op.drop_table("lineage_edges")

    op.drop_index("ix_runs_status", table_name="runs")
    op.drop_index("ix_runs_pipeline_version_id", table_name="runs")
    op.drop_constraint("fk_runs_pipeline_version", "runs", type_="foreignkey")
    op.drop_column("runs", "plugin_context")
    op.drop_column("runs", "plugin_name")
    op.drop_column("runs", "replay_from_task_id")
    op.drop_column("runs", "replay_of_run_id")
    op.drop_column("runs", "config_snapshot")
    op.drop_column("runs", "pipeline_version_id")

    op.drop_index("ix_pipeline_versions_scope_pipe", table_name="pipeline_versions")
    op.drop_index("uq_pipeline_versions_scope_pipe_ver", table_name="pipeline_versions")
    op.drop_table("pipeline_versions")

    op.drop_index("ix_dataset_versions_in_out_lineage", table_name="dataset_versions")
    op.drop_index("uq_dataset_versions_dataset_version", table_name="dataset_versions")
    op.drop_table("dataset_versions")

    op.execute("DROP INDEX IF EXISTS ix_datasets_name_trgm")
    op.drop_index("ix_datasets_tenant_project", table_name="datasets")
    op.drop_index("uq_datasets_scope_name", table_name="datasets")
    op.drop_table("datasets")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
