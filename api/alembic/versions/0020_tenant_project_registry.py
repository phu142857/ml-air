"""tenant project registry (catalog before activity)

Revision ID: 0020_tenant_project_registry
Revises: 0019_scope_context_state
Create Date: 2026-05-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0020_tenant_project_registry"
down_revision = "0019_scope_context_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_projects",
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("tenant_id", "project_id", name="pk_tenant_projects"),
    )
    op.create_index("ix_tenant_projects_tenant_id", "tenant_projects", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tenant_projects_tenant_id", table_name="tenant_projects")
    op.drop_table("tenant_projects")
