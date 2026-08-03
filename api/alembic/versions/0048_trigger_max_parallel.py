"""Add optional max_parallel_tasks to model_trigger_policies.

Revision ID: 0048_trigger_max_parallel
Revises: 0047_identity_mfa_totp
Create Date: 2026-08-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0048_trigger_max_parallel"
down_revision = "0047_identity_mfa_totp"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _column_exists("model_trigger_policies", "max_parallel_tasks"):
        op.add_column(
            "model_trigger_policies",
            sa.Column("max_parallel_tasks", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    if _column_exists("model_trigger_policies", "max_parallel_tasks"):
        op.drop_column("model_trigger_policies", "max_parallel_tasks")
