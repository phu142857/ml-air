from __future__ import annotations

import logging
import os
from typing import Any

from app.domains.governance import identity_repository as repo
from app.domains.governance.identity_ids import new_id
from app.domains.governance.identity_password import hash_password
from app.domains.governance.identity_service import SA_PERMISSION_CATALOG, replace_sa_permissions
from app.domains.governance.identity_token_service import hash_opaque

logger = logging.getLogger("mlair.identity.bootstrap")

PLATFORM_SA_PERMISSIONS = sorted(SA_PERMISSION_CATALOG)

BOOTSTRAP_SERVICE_ACCOUNTS: tuple[dict[str, Any], ...] = (
    {
        "name": "mlair-scheduler",
        "description": "Platform scheduler automation",
        "secret_env": "ML_AIR_SA_SCHEDULER_SECRET",
        "permissions": PLATFORM_SA_PERMISSIONS,
    },
    {
        "name": "mlair-executor",
        "description": "Platform executor automation",
        "secret_env": "ML_AIR_SA_EXECUTOR_SECRET",
        "permissions": PLATFORM_SA_PERMISSIONS,
    },
)


def maybe_bootstrap_global_admin() -> None:
    if not repo.identity_tables_available():
        return
    if repo.count_global_admins() > 0:
        return
    username = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_USERNAME", "admin").strip()
    password = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_PASSWORD", "").strip()
    if not password:
        password = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_PASSWORD_DEFAULT", "admin-change-me").strip()
    if not username or not password:
        return
    repo.insert_user(
        user_id=new_id("usr"),
        username=username,
        password_hash=hash_password(password),
        state="active",
        is_global_admin=True,
    )
    repo.insert_audit_event(
        event_id=new_id("aud"),
        actor_kind="system",
        actor_id=None,
        action="bootstrap.global_admin",
        target_type="user",
        target_id=username,
        result="success",
        ip=None,
        user_agent=None,
        correlation_id=None,
        payload={"schema_version": 1, "metadata": {}},
    )
    logger.info("Bootstrapped global admin user %s", username)


def maybe_bootstrap_service_accounts() -> None:
    if not repo.identity_tables_available():
        return
    tenant_id = os.getenv("ML_AIR_DEFAULT_TENANT", "default").strip() or "default"
    for spec in BOOTSTRAP_SERVICE_ACCOUNTS:
        secret = os.getenv(spec["secret_env"], "").strip()
        if not secret:
            continue
        existing = repo.get_service_account_by_name(spec["name"])
        if existing:
            sa_id = existing["id"]
            if existing["state"] != "active":
                repo.update_service_account(sa_id, name=None, description=None, state="active")
        else:
            sa_id = new_id("sa")
            repo.insert_service_account(
                sa_id=sa_id,
                name=spec["name"],
                description=spec.get("description"),
                state="active",
            )
            repo.insert_audit_event(
                event_id=new_id("aud"),
                actor_kind="system",
                actor_id=None,
                action="bootstrap.service_account",
                target_type="service_account",
                target_id=sa_id,
                result="success",
                ip=None,
                user_agent=None,
                correlation_id=None,
                payload={"schema_version": 1, "metadata": {"name": spec["name"]}},
            )
            logger.info("Bootstrapped service account %s", spec["name"])

        replace_sa_permissions(sa_id, list(spec["permissions"]))
        if not repo.list_sa_scopes(sa_id):
            repo.insert_sa_scope(
                scope_id=new_id("scp"),
                sa_id=sa_id,
                tenant_id=tenant_id,
                all_projects=True,
                project_ids=[],
            )
        if repo.count_active_sa_credentials(sa_id) == 0:
            repo.insert_sa_credential(
                token_id=new_id("tok"),
                sa_id=sa_id,
                secret_hash=hash_opaque(secret),
            )
            repo.insert_audit_event(
                event_id=new_id("aud"),
                actor_kind="system",
                actor_id=None,
                action="bootstrap.service_account_credential",
                target_type="service_account",
                target_id=sa_id,
                result="success",
                ip=None,
                user_agent=None,
                correlation_id=None,
                payload={"schema_version": 1, "metadata": {"name": spec["name"]}},
            )
