"""tenant quota max concurrent running runs per project

NOTE: `alembic_version.version_num` is VARCHAR(32) in some deployments, so
revision ids must stay <= 32 chars.

Revision ID: 0031_max_concurrent_runs
Revises: 0030_tenant_quota_max_parallel
Create Date: 2026-05-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0031_max_concurrent_runs"
down_revision = "0030_tenant_quota_max_parallel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_quotas",
        sa.Column("max_concurrent_running_runs_per_project", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_quotas", "max_concurrent_running_runs_per_project")

