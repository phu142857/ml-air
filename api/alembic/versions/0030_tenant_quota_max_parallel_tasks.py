"""tenant quota max parallel tasks (internal)

Revision ID: 0030_tenant_quota_max_parallel
Revises: 0029_tenant_quotas
Create Date: 2026-05-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0030_tenant_quota_max_parallel"
down_revision = "0029_tenant_quotas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_quotas", sa.Column("max_parallel_tasks", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_quotas", "max_parallel_tasks")
