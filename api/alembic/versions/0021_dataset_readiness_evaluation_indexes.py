"""readiness evaluation secondary indexes (status / policy lookups)

Revision ID: 0021_readiness_eval_indexes
Revises: 0020_tenant_project_registry
Create Date: 2026-05-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021_readiness_eval_indexes"
down_revision = "0020_tenant_project_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Hub/API may filter by status; supports ORDER BY evaluated_at DESC within scope.
    op.create_index(
        "ix_dataset_readiness_eval_scope_status_time",
        "dataset_readiness_evaluations",
        ["tenant_id", "project_id", "dataset_id", "status", "evaluated_at"],
        unique=False,
        postgresql_ops={"evaluated_at": "DESC"},
    )
    # Policy-scoped history (partial: only rows with policy_id).
    op.create_index(
        "ix_dataset_readiness_eval_policy_scope_time",
        "dataset_readiness_evaluations",
        ["tenant_id", "project_id", "dataset_id", "policy_id", "evaluated_at"],
        unique=False,
        postgresql_ops={"evaluated_at": "DESC"},
        postgresql_where=sa.text("policy_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dataset_readiness_eval_policy_scope_time",
        table_name="dataset_readiness_evaluations",
    )
    op.drop_index(
        "ix_dataset_readiness_eval_scope_status_time",
        table_name="dataset_readiness_evaluations",
    )
