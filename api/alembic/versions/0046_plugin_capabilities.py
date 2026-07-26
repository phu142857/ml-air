"""Plugin capability catalog (external worker metadata per project).

Revision ID: 0046_plugin_capabilities
Revises: 0045_user_profile_pat
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0046_plugin_capabilities"
down_revision = "0045_user_profile_pat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugin_capabilities",
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("execution_type", sa.String(length=32), server_default="external", nullable=False),
        sa.Column("worker_pool", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="available", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", "name", name="pk_plugin_capabilities"),
    )
    op.create_index(
        "ix_plugin_capabilities_scope",
        "plugin_capabilities",
        ["tenant_id", "project_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_plugin_capabilities_scope", table_name="plugin_capabilities")
    op.drop_table("plugin_capabilities")
