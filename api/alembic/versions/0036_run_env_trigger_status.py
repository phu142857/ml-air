"""Phase 1: runs.environment + trigger policy last attempt status

Revision ID: 0036_run_env_trigger_status
Revises: 0035_trigger_data_anchor
Create Date: 2026-06-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0036_run_env_trigger_status"
down_revision = "0035_trigger_data_anchor"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _column_exists("runs", "environment"):
        op.add_column("runs", sa.Column("environment", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    for name, col in (
        ("last_trigger_attempt_at", sa.Column("last_trigger_attempt_at", sa.DateTime(timezone=True), nullable=True)),
        ("last_trigger_outcome", sa.Column("last_trigger_outcome", sa.Text(), nullable=True)),
        ("last_skip_reason", sa.Column("last_skip_reason", sa.Text(), nullable=True)),
    ):
        if not _column_exists("model_trigger_policies", name):
            op.add_column("model_trigger_policies", col)


def downgrade() -> None:
    if _column_exists("runs", "environment"):
        op.drop_column("runs", "environment")
    for name in ("last_skip_reason", "last_trigger_outcome", "last_trigger_attempt_at"):
        if _column_exists("model_trigger_policies", name):
            op.drop_column("model_trigger_policies", name)
