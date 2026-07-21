"""L4 system runtime settings service (Package 002 Phase 2)."""

from __future__ import annotations

import logging
import os
from typing import Any

from app.domains.platform import system_settings_document as doc
from app.domains.platform import system_settings_repository as repo

logger = logging.getLogger("mlair.platform.system_settings")

_l4_cache: dict[str, Any] | None = None


def invalidate_l4_cache() -> None:
    global _l4_cache
    _l4_cache = None


def _profile_bundle() -> dict[str, Any]:
    profile = os.getenv("MLAIR_PROFILE", "").strip() or None
    try:
        from mlair.config.loader import load_config

        return load_config(profile=profile)
    except ImportError:
        return {"profile": profile or "development", "features": {}}


def maybe_seed_system_settings() -> bool:
    """Insert seed row on first boot. Returns True when a new row was created."""
    if not repo.system_settings_table_available():
        return False
    if repo.fetch_row():
        return False
    profile_cfg = _profile_bundle()
    seed = doc.build_seed_settings(profile_cfg)
    repo.insert_seed(settings=seed, updated_by=None)
    invalidate_l4_cache()
    logger.info(
        "system_settings_seeded profile=%s keys=%s",
        profile_cfg.get("profile"),
        sorted(seed.keys()),
    )
    return True


def get_l4_settings() -> dict[str, Any] | None:
    """Cached L4 settings dict (inner ``settings`` object only)."""
    global _l4_cache
    if _l4_cache is not None:
        return _l4_cache
    if not repo.system_settings_table_available():
        return None
    row = repo.fetch_row()
    if not row:
        return None
    settings = row.get("settings")
    if not isinstance(settings, dict):
        return None
    _l4_cache = settings
    return _l4_cache


def get_system_settings_document() -> dict[str, Any]:
    row = repo.fetch_row()
    if not row:
        seed = doc.build_seed_settings(_profile_bundle())
        return doc.public_document(
            settings=seed,
            schema_version=doc.SCHEMA_VERSION,
            updated_at="",
            updated_by=None,
        )
    return doc.public_document(
        settings=row["settings"],
        schema_version=int(row["schema_version"]),
        updated_at=str(row["updated_at"]),
        updated_by=row.get("updated_by"),
    )


def patch_system_settings(partial: dict[str, Any], *, actor_user_id: str | None) -> dict[str, Any]:
    row = repo.fetch_row()
    if not row:
        maybe_seed_system_settings()
        row = repo.fetch_row()
    if not row:
        raise RuntimeError("system_settings unavailable")

    current = row["settings"] if isinstance(row.get("settings"), dict) else {}
    merged = doc.validate_settings_patch(current, partial)
    updated = repo.update_settings(settings=merged, updated_by=actor_user_id)
    invalidate_l4_cache()

    try:
        from app.domains.governance import identity_repository as identity_repo

        if identity_repo.identity_tables_available():
            from app.domains.governance.identity_ids import new_id

            identity_repo.insert_audit_event(
                event_id=new_id("aud"),
                actor_kind="user",
                actor_id=actor_user_id,
                action="system_settings.patch",
                target_type="system_settings",
                target_id=doc.SINGLETON_ID,
                result="success",
                ip=None,
                user_agent=None,
                correlation_id=None,
                payload={"keys": sorted(partial.keys())},
            )
    except Exception:
        logger.debug("system_settings audit skipped", exc_info=True)

    return doc.public_document(
        settings=updated["settings"],
        schema_version=int(updated["schema_version"]),
        updated_at=str(updated["updated_at"]),
        updated_by=updated.get("updated_by"),
    )
