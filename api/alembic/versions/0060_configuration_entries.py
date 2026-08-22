"""Configuration entries for Control Plane scoped configuration.

Revision ID: 0060_configuration_entries
Revises: 0059_closed_loop_mlops
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0060_configuration_entries"
down_revision = "0059_closed_loop_mlops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cp_configuration_entries",
        sa.Column("entry_id", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("value_type", sa.Text(), nullable=False),
        sa.Column("scope_level", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("project_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("environment_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("resource_type", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("resource_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("entry_id", name="pk_cp_configuration_entries"),
        sa.UniqueConstraint(
            "scope_level",
            "tenant_id",
            "project_id",
            "environment_id",
            "resource_type",
            "resource_id",
            "key",
            name="uq_cp_configuration_entries_scope_key",
        ),
        sa.CheckConstraint(
            "scope_level IN ('global', 'project', 'environment', 'resource')",
            name="ck_cp_configuration_entries_scope_level",
        ),
    )
    op.create_index(
        "ix_cp_configuration_entries_scope",
        "cp_configuration_entries",
        ["tenant_id", "project_id", "scope_level"],
        unique=False,
    )

    op.create_table(
        "cp_configuration_entry_log",
        sa.Column("log_id", sa.Text(), nullable=False),
        sa.Column("entry_id", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("scope_level", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("project_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("environment_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("resource_type", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("resource_id", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("change_type", sa.Text(), nullable=False),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("log_id", name="pk_cp_configuration_entry_log"),
    )
    op.create_index(
        "ix_cp_configuration_entry_log_scope_key",
        "cp_configuration_entry_log",
        ["tenant_id", "project_id", "key", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_cp_configuration_entry_log_scope_key", table_name="cp_configuration_entry_log")
    op.drop_table("cp_configuration_entry_log")
    op.drop_index("ix_cp_configuration_entries_scope", table_name="cp_configuration_entries")
    op.drop_table("cp_configuration_entries")
