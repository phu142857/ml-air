"""User profile fields and personal access tokens.

Revision ID: 0045_user_profile_pat
Revises: 0044_system_settings
Create Date: 2026-07-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0045_user_profile_pat"
down_revision = "0044_system_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("email", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "user_personal_access_tokens",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_upat_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_personal_access_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_upat_token_hash"),
    )
    op.create_index("ix_upat_user_id", "user_personal_access_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_upat_user_id", table_name="user_personal_access_tokens")
    op.drop_table("user_personal_access_tokens")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "email")
    op.drop_column("users", "display_name")
