"""Identity MFA (TOTP + recovery codes).

Revision ID: 0047_identity_mfa_totp
Revises: 0046_plugin_capabilities
Create Date: 2026-07-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0047_identity_mfa_totp"
down_revision = "0046_plugin_capabilities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_mfa_totp",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("secret_ciphertext", sa.Text(), nullable=False),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_mfa_totp_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_mfa_totp"),
    )
    op.create_index("ix_user_mfa_totp_user_id", "user_mfa_totp", ["user_id"], unique=False)
    op.create_index(
        "uq_user_mfa_totp_active_per_user",
        "user_mfa_totp",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("disabled_at IS NULL"),
    )

    op.create_table(
        "user_recovery_codes",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_recovery_codes_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_recovery_codes"),
    )
    op.create_index("ix_user_recovery_codes_user_id", "user_recovery_codes", ["user_id"], unique=False)
    op.create_index("ix_user_recovery_codes_code_hash", "user_recovery_codes", ["code_hash"], unique=False)

    op.create_table(
        "identity_mfa_challenges",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("challenge_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_identity_mfa_challenges_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_identity_mfa_challenges"),
        sa.UniqueConstraint("challenge_hash", name="uq_identity_mfa_challenges_hash"),
    )
    op.create_index("ix_identity_mfa_challenges_user_id", "identity_mfa_challenges", ["user_id"], unique=False)
    op.create_index(
        "ix_identity_mfa_challenges_open",
        "identity_mfa_challenges",
        ["user_id", "expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_identity_mfa_challenges_open", table_name="identity_mfa_challenges")
    op.drop_index("ix_identity_mfa_challenges_user_id", table_name="identity_mfa_challenges")
    op.drop_table("identity_mfa_challenges")

    op.drop_index("ix_user_recovery_codes_code_hash", table_name="user_recovery_codes")
    op.drop_index("ix_user_recovery_codes_user_id", table_name="user_recovery_codes")
    op.drop_table("user_recovery_codes")

    op.drop_index("uq_user_mfa_totp_active_per_user", table_name="user_mfa_totp")
    op.drop_index("ix_user_mfa_totp_user_id", table_name="user_mfa_totp")
    op.drop_table("user_mfa_totp")
