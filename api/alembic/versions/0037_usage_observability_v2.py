"""Extended resource usage stats (P95, network, GPU power/temp, events).

Revision ID: 0037_usage_observability_v2
Revises: 0036_run_env_trigger_status
Create Date: 2026-07-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0037_usage_observability_v2"
down_revision = "0036_run_env_trigger_status"
branch_labels = None
depends_on = None

_SAMPLE_STAT_COLS = (
    ("cpu_pct_p95", sa.Float()),
    ("gpu_power_w_avg", sa.Float()),
    ("gpu_power_w_peak", sa.Float()),
    ("gpu_temp_c_peak", sa.Float()),
)

_USAGE_TOTAL_COLS = (
    ("network_rx_bytes", sa.BigInteger()),
    ("network_tx_bytes", sa.BigInteger()),
)

_SAMPLE_POINT_COLS = (
    ("network_rx_bytes", sa.BigInteger()),
    ("network_tx_bytes", sa.BigInteger()),
    ("gpu_power_w", sa.Float()),
    ("gpu_temp_c", sa.Float()),
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
        for name, col_type in _USAGE_TOTAL_COLS:
            if not _column_exists(table, name):
                op.add_column(table, sa.Column(name, col_type, nullable=True))

    if not _column_exists("task_usage", "resource_events"):
        op.add_column("task_usage", sa.Column("resource_events", sa.JSON(), nullable=True))

    for name, col_type in _SAMPLE_POINT_COLS:
        if not _column_exists("task_usage_samples", name):
            op.add_column("task_usage_samples", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_SAMPLE_POINT_COLS):
        if _column_exists("task_usage_samples", name):
            op.drop_column("task_usage_samples", name)

    if _column_exists("task_usage", "resource_events"):
        op.drop_column("task_usage", "resource_events")

    for table in ("task_usage", "run_usage"):
        for name, _ in reversed(_USAGE_TOTAL_COLS):
            if _column_exists(table, name):
                op.drop_column(table, name)
        for name, _ in reversed(_SAMPLE_STAT_COLS):
            if _column_exists(table, name):
                op.drop_column(table, name)
