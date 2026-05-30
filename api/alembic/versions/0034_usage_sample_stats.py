"""add avg/peak sample stats to task_usage and run_usage

Revision ID: 0034_usage_sample_stats
Revises: 0033_usage_drop_cost
Create Date: 2026-05-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0034_usage_sample_stats"
down_revision = "0033_usage_drop_cost"
branch_labels = None
depends_on = None

_SAMPLE_STAT_COLS = (
    ("cpu_pct_avg", sa.Float()),
    ("cpu_pct_peak", sa.Float()),
    ("memory_mb_avg", sa.Float()),
    ("memory_mb_peak", sa.Float()),
    ("gpu_util_pct_avg", sa.Float()),
    ("gpu_util_pct_peak", sa.Float()),
    ("gpu_memory_mb_avg", sa.Float()),
    ("gpu_memory_mb_peak", sa.Float()),
)


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    for table in ("task_usage", "run_usage"):
        for name, col_type in _SAMPLE_STAT_COLS:
            if not _column_exists(table, name):
                op.add_column(table, sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for table in ("task_usage", "run_usage"):
        for name, _ in reversed(_SAMPLE_STAT_COLS):
            if _column_exists(table, name):
                op.drop_column(table, name)
