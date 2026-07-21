"""persist auth scope context override

Revision ID: 0019_scope_context_state
Revises: 0018_accum_materialization
Create Date: 2026-05-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0019_scope_context_state"
down_revision = "0018_accum_materialization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_scope_context_overrides",
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("mapping_version", sa.BigInteger(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("subject", name="pk_auth_scope_context_overrides"),
    )
    op.create_index(
        "ix_auth_scope_context_overrides_scope",
        "auth_scope_context_overrides",
        ["tenant_id", "project_id"],
        unique=False,
    )
    op.alter_column("auth_scope_context_overrides", "mapping_version", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_auth_scope_context_overrides_scope", table_name="auth_scope_context_overrides")
    op.drop_table("auth_scope_context_overrides")
