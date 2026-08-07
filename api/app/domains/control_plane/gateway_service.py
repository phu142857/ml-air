"""AI Gateway — unified LLM routing (Phase 5 Epic 3)."""

from __future__ import annotations

import fnmatch
import json
import logging
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

from app.domains.control_plane.config import ai_gateway_enabled
from app.domains.control_plane import gateway_cache
from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.api.ai_gateway")

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
MAX_RETRIES = max(1, int(__import__("os").getenv("ML_AIR_GATEWAY_MAX_RETRIES", "3")))

SUPPORTED_PROVIDER_TYPES = (
    "openai",
    "azure_openai",
    "anthropic",
    "gemini",
    "mistral",
    "ollama",
    "vllm",
)


def list_providers(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT provider_id, provider_type, name, base_url, config, enabled, created_at
                FROM cp_ai_providers
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at ASC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "provider_id": str(r[0]),
            "provider_type": str(r[1]),
            "name": str(r[2]),
            "base_url": str(r[3]),
            "config": r[4] if isinstance(r[4], dict) else json.loads(r[4] or "{}"),
            "enabled": bool(r[5]),
            "created_at": r[6].isoformat() if r[6] else None,
        }
        for r in rows
    ]


def create_provider(
    *,
    tenant_id: str,
    project_id: str,
    provider_type: str,
    name: str,
    base_url: str,
    config: dict[str, Any] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    ptype = str(provider_type or "").strip().lower()
    if ptype not in SUPPORTED_PROVIDER_TYPES:
        raise ValueError("unsupported_provider_type")
    pid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_ai_providers
                    (provider_id, tenant_id, project_id, provider_type, name, base_url, config, enabled)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (pid, tenant_id, project_id, ptype, name, base_url, json.dumps(config or {}), enabled),
            )
    return {"provider_id": pid, "provider_type": ptype, "name": name, "base_url": base_url, "enabled": enabled}


def list_routes(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT route_id, model_pattern, provider_id, fallback_provider_id, priority, enabled
                FROM cp_ai_routes
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY priority ASC, route_id ASC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "route_id": str(r[0]),
            "model_pattern": str(r[1]),
            "provider_id": str(r[2]),
            "fallback_provider_id": str(r[3]) if r[3] else None,
            "priority": int(r[4]),
            "enabled": bool(r[5]),
        }
        for r in rows
    ]


def create_route(
    *,
    tenant_id: str,
    project_id: str,
    model_pattern: str,
    provider_id: str,
    fallback_provider_id: str | None = None,
    priority: int = 100,
    enabled: bool = True,
) -> dict[str, Any]:
    rid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_ai_routes
                    (route_id, tenant_id, project_id, model_pattern, provider_id, fallback_provider_id, priority, enabled)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (rid, tenant_id, project_id, model_pattern, provider_id, fallback_provider_id, priority, enabled),
            )
    return {
        "route_id": rid,
        "model_pattern": model_pattern,
        "provider_id": provider_id,
        "fallback_provider_id": fallback_provider_id,
        "priority": priority,
        "enabled": enabled,
    }


def _load_provider(provider_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT provider_id, base_url, config, provider_type, enabled
                FROM cp_ai_providers WHERE provider_id = %s
                """,
                (provider_id,),
            )
            row = cur.fetchone()
    if not row or not bool(row[4]):
        return None
    return {
        "provider_id": str(row[0]),
        "base_url": str(row[1]),
        "config": row[2] if isinstance(row[2], dict) else json.loads(row[2] or "{}"),
        "provider_type": str(row[3]),
    }


def resolve_route(*, tenant_id: str, project_id: str, model: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.route_id, r.model_pattern, r.provider_id, r.fallback_provider_id
                FROM cp_ai_routes r
                JOIN cp_ai_providers p ON p.provider_id = r.provider_id
                WHERE r.tenant_id = %s AND r.project_id = %s AND r.enabled = true AND p.enabled = true
                ORDER BY r.priority ASC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    model_l = model.lower()
    for route_id, pattern, provider_id, fallback_id in rows:
        if fnmatch.fnmatchcase(model_l, str(pattern).lower()):
            provider = _load_provider(str(provider_id))
            if not provider:
                continue
            return {
                "route_id": str(route_id),
                "model_pattern": str(pattern),
                "provider_id": provider["provider_id"],
                "fallback_provider_id": str(fallback_id) if fallback_id else None,
                "base_url": provider["base_url"],
                "config": provider["config"],
                "provider_type": provider["provider_type"],
            }
    providers = [p for p in list_providers(tenant_id, project_id) if p.get("enabled")]
    if providers:
        p = providers[0]
        return {
            "route_id": None,
            "provider_id": p["provider_id"],
            "fallback_provider_id": None,
            "base_url": p["base_url"],
            "config": p.get("config") or {},
            "provider_type": p["provider_type"],
        }
    return None


def _post_chat(*, route: dict[str, Any], model: str, messages: list[dict[str, Any]], temperature: float) -> dict[str, Any]:
    body = json.dumps({"model": model, "messages": messages, "temperature": temperature}, separators=(",", ":")).encode(
        "utf-8"
    )
    url = str(route["base_url"]).rstrip("/") + "/v1/chat/completions"
    api_key = str((route.get("config") or {}).get("api_key") or "")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code not in RETRYABLE_STATUS or attempt >= MAX_RETRIES - 1:
                raise
            delay = min(2.0**attempt, 8.0)
            logger.warning("ai_gateway_retry attempt=%s status=%s delay=%s", attempt + 1, exc.code, delay)
            time.sleep(delay)
        except urllib.error.URLError as exc:
            last_exc = exc
            if attempt >= MAX_RETRIES - 1:
                raise
            delay = min(2.0**attempt, 8.0)
            logger.warning("ai_gateway_retry attempt=%s url_err=%s delay=%s", attempt + 1, exc, delay)
            time.sleep(delay)
    if last_exc:
        raise last_exc
    raise RuntimeError("gateway_request_failed")


def chat_completion(
    *,
    tenant_id: str,
    project_id: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.7,
    use_cache: bool = True,
) -> dict[str, Any]:
    if not ai_gateway_enabled():
        raise RuntimeError("ai_gateway_disabled")
    if use_cache:
        cached = gateway_cache.get_cached(
            tenant_id=tenant_id, project_id=project_id, model=model, messages=messages, temperature=temperature
        )
        if cached:
            return {**cached, "cached": True}
    route = resolve_route(tenant_id=tenant_id, project_id=project_id, model=model)
    if not route:
        raise RuntimeError("no_provider_configured")
    try:
        data = _post_chat(route=route, model=model, messages=messages, temperature=temperature)
        result = {"provider_id": route["provider_id"], "route_id": route.get("route_id"), "response": data, "cached": False}
    except urllib.error.HTTPError as exc:
        fallback_id = route.get("fallback_provider_id")
        if fallback_id:
            fallback = _load_provider(str(fallback_id))
            if fallback:
                logger.warning("ai_gateway_fallback primary=%s fallback=%s err=%s", route["provider_id"], fallback_id, exc)
                data = _post_chat(route=fallback, model=model, messages=messages, temperature=temperature)
                result = {
                    "provider_id": fallback["provider_id"],
                    "route_id": route.get("route_id"),
                    "response": data,
                    "fallback": True,
                    "cached": False,
                }
            else:
                raise
        else:
            raise
    if use_cache:
        gateway_cache.set_cached(
            tenant_id=tenant_id,
            project_id=project_id,
            model=model,
            messages=messages,
            temperature=temperature,
            value=result,
        )
    return result
