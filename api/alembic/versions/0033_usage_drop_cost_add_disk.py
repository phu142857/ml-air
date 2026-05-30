"""drop monetary run_cost; add disk bytes to usage tables if missing

Revision ID: 0033_usage_drop_cost
Revises: 0032_usage_cost
Create Date: 2026-05-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0033_usage_drop_cost"
down_revision = "0032_usage_cost"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return name in insp.get_table_names()


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if _table_exists("run_cost"):
        op.drop_index("ix_run_cost_tenant_project", table_name="run_cost")
        op.drop_table("run_cost")

    for table in ("task_usage", "run_usage"):
        if not _table_exists(table):
            continue
        if not _column_exists(table, "disk_read_bytes"):
            op.add_column(table, sa.Column("disk_read_bytes", sa.BigInteger(), nullable=True))
        if not _column_exists(table, "disk_write_bytes"):
            op.add_column(table, sa.Column("disk_write_bytes", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    for table in ("task_usage", "run_usage"):
        if _table_exists(table) and _column_exists(table, "disk_read_bytes"):
            op.drop_column(table, "disk_read_bytes")
        if _table_exists(table) and _column_exists(table, "disk_write_bytes"):
            op.drop_column(table, "disk_write_bytes")
