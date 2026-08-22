"""Phase III closed-loop MLOps tables.

Revision ID: 0059_closed_loop_mlops
Revises: 0058_model_governance_phase2
Create Date: 2026-08-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0059_closed_loop_mlops"
down_revision = "0058_model_governance_phase2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_production_metrics",
        sa.Column("sample_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=True),
        sa.Column("metric_key", sa.Text(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("labels", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'production'")),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("sample_id", name="pk_model_production_metrics"),
    )
    op.create_index(
        "ix_model_prod_metrics_scope_time",
        "model_production_metrics",
        ["tenant_id", "project_id", "model_id", "recorded_at"],
        unique=False,
    )

    op.create_table(
        "model_slo_rules",
        sa.Column("rule_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric_key", sa.Text(), nullable=False),
        sa.Column("operator", sa.Text(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False, server_default=sa.text("'warning'")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("rule_id", name="pk_model_slo_rules"),
        sa.CheckConstraint(
            "operator IN ('lt', 'lte', 'gt', 'gte')",
            name="ck_model_slo_rules_operator",
        ),
    )
    op.create_index(
        "ix_model_slo_rules_scope",
        "model_slo_rules",
        ["tenant_id", "project_id", "model_id"],
        unique=False,
    )

    op.create_table(
        "model_closed_loop_policies",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), sa.ForeignKey("models.model_id", ondelete="CASCADE"), nullable=False),
        sa.Column("monitoring_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("auto_retrain_on_breach", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auto_promote_on_eval_pass", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auto_rollback_on_breach", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("drift_psi_threshold", sa.Float(), nullable=False, server_default=sa.text("0.2")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "model_id", name="pk_model_closed_loop_policies"),
    )

    op.create_table(
        "closed_loop_events",
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("model_id", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False, server_default=sa.text("'info'")),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("event_id", name="pk_closed_loop_events"),
    )
    op.create_index(
        "ix_closed_loop_events_scope_time",
        "closed_loop_events",
        ["tenant_id", "project_id", "model_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_closed_loop_events_scope_time", table_name="closed_loop_events")
    op.drop_table("closed_loop_events")
    op.drop_table("model_closed_loop_policies")
    op.drop_index("ix_model_slo_rules_scope", table_name="model_slo_rules")
    op.drop_table("model_slo_rules")
    op.drop_index("ix_model_prod_metrics_scope_time", table_name="model_production_metrics")
    op.drop_table("model_production_metrics")
