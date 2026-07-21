"""Identity schema (Design Package v1.0 / P3 Logical Database).

Revision ID: 0043_identity_schema
Revises: 0042_run_log_entries
Create Date: 2026-07-13

Creates Identity tables only — no seed data, no dual-run, no auth logic.
tenant_id / project_id reference the product scope dimension as Text
(same pattern as auth_scope_context_overrides); registry table is
tenant_projects (composite PK). Cross-tenant project membership is
enforced at write time (P3), not via a missing tenants table FK.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0043_identity_schema"
down_revision = "0042_run_log_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("is_global_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.CheckConstraint(
            "state IN ('pending_activation', 'active', 'locked', 'disabled', 'deleted')",
            name="ck_users_state",
        ),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=False)
    op.create_index("ix_users_state", "users", ["state"], unique=False)

    # --- user_role_assignments ---
    op.create_table(
        "user_role_assignments",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("all_projects", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_ura_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_role_assignments"),
        sa.CheckConstraint(
            "role IN ('maintainer', 'viewer')",
            name="ck_ura_role",
        ),
    )
    op.create_index("ix_ura_user_id", "user_role_assignments", ["user_id"], unique=False)
    op.create_index("ix_ura_tenant_id", "user_role_assignments", ["tenant_id"], unique=False)
    # P3: no duplicate ALL-project assignments for same (user, tenant, role)
    op.create_index(
        "uq_ura_user_tenant_role_all",
        "user_role_assignments",
        ["user_id", "tenant_id", "role"],
        unique=True,
        postgresql_where=sa.text("all_projects = true"),
    )

    # --- user_role_assignment_projects ---
    op.create_table(
        "user_role_assignment_projects",
        sa.Column("assignment_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["user_role_assignments.id"],
            name="fk_urap_assignment_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("assignment_id", "project_id", name="pk_user_role_assignment_projects"),
    )

    # --- service_accounts ---
    op.create_table(
        "service_accounts",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_service_accounts"),
        sa.CheckConstraint(
            "state IN ('created', 'active', 'revoked')",
            name="ck_service_accounts_state",
        ),
    )
    op.create_index("ix_service_accounts_name", "service_accounts", ["name"], unique=False)
    op.create_index("ix_service_accounts_state", "service_accounts", ["state"], unique=False)

    # --- service_account_credentials (multi-active allowed) ---
    op.create_table(
        "service_account_credentials",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("service_account_id", sa.Text(), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["service_account_id"],
            ["service_accounts.id"],
            name="fk_sac_service_account_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_account_credentials"),
    )
    op.create_index(
        "ix_sac_service_account_id",
        "service_account_credentials",
        ["service_account_id"],
        unique=False,
    )

    # --- service_account_permissions ---
    op.create_table(
        "service_account_permissions",
        sa.Column("service_account_id", sa.Text(), nullable=False),
        sa.Column("permission", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["service_account_id"],
            ["service_accounts.id"],
            name="fk_sap_service_account_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "service_account_id",
            "permission",
            name="pk_service_account_permissions",
        ),
    )

    # --- service_account_scopes ---
    op.create_table(
        "service_account_scopes",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("service_account_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("all_projects", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["service_account_id"],
            ["service_accounts.id"],
            name="fk_sas_service_account_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_account_scopes"),
    )
    op.create_index("ix_sas_service_account_id", "service_account_scopes", ["service_account_id"], unique=False)
    op.create_index("ix_sas_tenant_id", "service_account_scopes", ["tenant_id"], unique=False)
    op.create_index(
        "uq_sas_sa_tenant_all",
        "service_account_scopes",
        ["service_account_id", "tenant_id"],
        unique=True,
        postgresql_where=sa.text("all_projects = true"),
    )

    # --- service_account_scope_projects ---
    op.create_table(
        "service_account_scope_projects",
        sa.Column("scope_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["scope_id"],
            ["service_account_scopes.id"],
            name="fk_sasp_scope_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("scope_id", "project_id", name="pk_service_account_scope_projects"),
    )

    # --- user_sessions ---
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("refresh_token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotated_from_id", sa.Text(), nullable=True),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_sessions_user_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["rotated_from_id"],
            ["user_sessions.id"],
            name="fk_user_sessions_rotated_from_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_sessions"),
        sa.UniqueConstraint("refresh_token_hash", name="uq_user_sessions_refresh_token_hash"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
    op.create_index("ix_user_sessions_refresh_token_hash", "user_sessions", ["refresh_token_hash"], unique=False)

    # --- identity_audit_events (append-only by convention; no UPDATE/DELETE triggers here) ---
    op.create_table(
        "identity_audit_events",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("actor_kind", sa.Text(), nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=True),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column("result", sa.Text(), nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("correlation_id", sa.Text(), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_identity_audit_events"),
        sa.CheckConstraint(
            "actor_kind IN ('user', 'service_account', 'system')",
            name="ck_identity_audit_events_actor_kind",
        ),
    )
    op.create_index("ix_identity_audit_events_occurred_at", "identity_audit_events", ["occurred_at"], unique=False)
    op.create_index("ix_identity_audit_events_actor", "identity_audit_events", ["actor_kind", "actor_id"], unique=False)
    op.create_index("ix_identity_audit_events_action", "identity_audit_events", ["action"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_identity_audit_events_action", table_name="identity_audit_events")
    op.drop_index("ix_identity_audit_events_actor", table_name="identity_audit_events")
    op.drop_index("ix_identity_audit_events_occurred_at", table_name="identity_audit_events")
    op.drop_table("identity_audit_events")

    op.drop_index("ix_user_sessions_refresh_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")

    op.drop_table("service_account_scope_projects")
    op.drop_index("uq_sas_sa_tenant_all", table_name="service_account_scopes")
    op.drop_index("ix_sas_tenant_id", table_name="service_account_scopes")
    op.drop_index("ix_sas_service_account_id", table_name="service_account_scopes")
    op.drop_table("service_account_scopes")

    op.drop_table("service_account_permissions")

    op.drop_index("ix_sac_service_account_id", table_name="service_account_credentials")
    op.drop_table("service_account_credentials")

    op.drop_index("ix_service_accounts_state", table_name="service_accounts")
    op.drop_index("ix_service_accounts_name", table_name="service_accounts")
    op.drop_table("service_accounts")

    op.drop_table("user_role_assignment_projects")
    op.drop_index("uq_ura_user_tenant_role_all", table_name="user_role_assignments")
    op.drop_index("ix_ura_tenant_id", table_name="user_role_assignments")
    op.drop_index("ix_ura_user_id", table_name="user_role_assignments")
    op.drop_table("user_role_assignments")

    op.drop_index("ix_users_state", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
