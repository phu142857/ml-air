"""add tracking and model registry tables

Revision ID: 0003_tracking_registry
Revises: 0002_run_priority_parallel
Create Date: 2026-04-25 03:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_tracking_registry"
down_revision = "0002_run_priority_parallel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "experiments",
        sa.Column("experiment_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_experiments_scope_name", "experiments", ["tenant_id", "project_id", "name"], unique=True)

    op.add_column("runs", sa.Column("experiment_id", sa.Text(), nullable=True))
    op.create_foreign_key("fk_runs_experiment_id", "runs", "experiments", ["experiment_id"], ["experiment_id"], ondelete="SET NULL")

    op.create_table(
        "run_params",
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "run_metrics",
        sa.Column("metric_id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_run_metrics_run_key_step", "run_metrics", ["run_id", "key", "step"], unique=False)

    op.create_table(
        "run_artifacts",
        sa.Column("artifact_id", sa.Text(), primary_key=True),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("uri", sa.Text(), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_run_artifacts_run_path", "run_artifacts", ["run_id", "path"], unique=False)

    op.create_table(
        "models",
        sa.Column("model_id", sa.Text(), primary_key=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_models_scope_name", "models", ["tenant_id", "project_id", "name"], unique=True)

    op.create_table(
        "model_versions",
        sa.Column("version_id", sa.Text(), primary_key=True),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="SET NULL"), nullable=True),
        sa.Column("artifact_uri", sa.Text(), nullable=True),
        sa.Column("stage", sa.Text(), nullable=False, server_default="staging"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_model_versions_model_version", "model_versions", ["model_id", "version"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_model_versions_model_version", table_name="model_versions")
    op.drop_table("model_versions")
    op.drop_index("uq_models_scope_name", table_name="models")
    op.drop_table("models")
    op.drop_index("ix_run_artifacts_run_path", table_name="run_artifacts")
    op.drop_table("run_artifacts")
    op.drop_index("ix_run_metrics_run_key_step", table_name="run_metrics")
    op.drop_table("run_metrics")
    op.drop_table("run_params")
    op.drop_constraint("fk_runs_experiment_id", "runs", type_="foreignkey")
    op.drop_column("runs", "experiment_id")
    op.drop_index("uq_experiments_scope_name", table_name="experiments")
    op.drop_table("experiments")
