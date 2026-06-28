"""model trigger policy data anchor (dataset version + training policy)

Revision ID: 0035_trigger_data_anchor
Revises: 0034_usage_sample_stats
Create Date: 2026-06-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0035_trigger_data_anchor"
down_revision = "0034_usage_sample_stats"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    # Note: model_trigger_policies.policy_id is the BIGINT PK (0009) — use training_policy_id for dataset policy UUID.
    for name in ("dataset_id", "dataset_version_id", "training_policy_id"):
        if not _column_exists("model_trigger_policies", name):
            op.add_column("model_trigger_policies", sa.Column(name, sa.Text(), nullable=True))


def downgrade() -> None:
    for name in ("training_policy_id", "dataset_version_id", "dataset_id"):
        if _column_exists("model_trigger_policies", name):
            op.drop_column("model_trigger_policies", name)
