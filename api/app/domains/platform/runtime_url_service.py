"""Resolve browser-facing API / realtime base URLs for GET /v1/runtime-config."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from starlette.requests import Request


def resolve_runtime_api_base_url(request: Request | None = None) -> str | None:
    explicit = os.getenv("ML_AIR_RUNTIME_API_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    if request is None:
        return None
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip()
    if not host:
        return None
    # First value when proxies send comma-separated lists.
    host = host.split(",")[0].strip()
    proto = (
        request.headers.get("x-forwarded-proto")
        or getattr(request.url, "scheme", None)
        or "http"
    ).strip()
    proto = proto.split(",")[0].strip() or "http"
    return f"{proto}://{host}".rstrip("/")


def resolve_runtime_realtime_base_url(
    request: Request | None = None,
    *,
    api_base_url: str | None = None,
) -> str | None:
    explicit = os.getenv("ML_AIR_RUNTIME_REALTIME_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    if os.getenv("MLAIR_REALTIME_ENABLED", "true").strip().lower() in {"0", "false", "no", "off"}:
        return None
    default = os.getenv("ML_AIR_RUNTIME_REALTIME_DEFAULT_URL", "").strip()
    if default:
        return default.rstrip("/")
    base = (api_base_url or "").strip() or resolve_runtime_api_base_url(request)
    if not base:
        return None
    parsed = urlparse(base if "://" in base else f"https://{base}")
    if not parsed.netloc:
        return None
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{ws_scheme}://{parsed.netloc}".rstrip("/")
