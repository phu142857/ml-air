"""Redis cache for AI Gateway chat completions."""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

CACHE_PREFIX = "mlair:gateway:cache:"


def cache_ttl_seconds() -> int:
    raw = os.getenv("ML_AIR_GATEWAY_CACHE_TTL_SEC", "300").strip()
    try:
        return max(0, int(raw))
    except ValueError:
        return 300


def cache_enabled() -> bool:
    return os.getenv("ML_AIR_GATEWAY_CACHE", "1").strip() == "1"


def _cache_key(*, tenant_id: str, project_id: str, model: str, messages: list[dict[str, Any]], temperature: float) -> str:
    payload = json.dumps(
        {"tenant_id": tenant_id, "project_id": project_id, "model": model, "messages": messages, "temperature": temperature},
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{CACHE_PREFIX}{digest}"


def get_cached(
    *,
    tenant_id: str,
    project_id: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float,
) -> dict[str, Any] | None:
    if not cache_enabled() or cache_ttl_seconds() <= 0:
        return None
    from app.domains.shared.queue_service import redis_client

    key = _cache_key(tenant_id=tenant_id, project_id=project_id, model=model, messages=messages, temperature=temperature)
    raw = redis_client().get(key)
    if not raw:
        return None
    try:
        return json.loads(str(raw))
    except json.JSONDecodeError:
        return None


def set_cached(
    *,
    tenant_id: str,
    project_id: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float,
    value: dict[str, Any],
) -> None:
    if not cache_enabled() or cache_ttl_seconds() <= 0:
        return
    from app.domains.shared.queue_service import redis_client

    key = _cache_key(tenant_id=tenant_id, project_id=project_id, model=model, messages=messages, temperature=temperature)
    redis_client().setex(key, cache_ttl_seconds(), json.dumps(value, separators=(",", ":")))
