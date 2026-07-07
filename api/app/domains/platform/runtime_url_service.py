"""Resolve browser-facing API / realtime base URLs for GET /v1/runtime-config."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from starlette.requests import Request

_INTERNAL_REALTIME_PORTS = frozenset({8001})


def _parse_netloc(url: str) -> tuple[str, int | None]:
    raw = url.strip()
    if not raw:
        return "", None
    if "://" not in raw:
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    return (parsed.hostname or "").lower(), parsed.port


def _realtime_ws_from_api_base(api_base_url: str) -> str | None:
    base = api_base_url.strip()
    if not base:
        return None
    if "://" not in base:
        base = f"https://{base}"
    parsed = urlparse(base)
    if not parsed.netloc:
        return None
    ws_scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{ws_scheme}://{parsed.netloc}/ws"


def _is_internal_loopback_realtime_url(url: str) -> bool:
    host, port = _parse_netloc(url)
    if host not in ("localhost", "127.0.0.1"):
        return False
    return port in _INTERNAL_REALTIME_PORTS or port is None


def _should_rewrite_internal_realtime_url(explicit: str, api_base_url: str | None) -> bool:
    if not _is_internal_loopback_realtime_url(explicit):
        return False
    if not api_base_url:
        return False
    exp_host, exp_port = _parse_netloc(explicit)
    api_host, api_port = _parse_netloc(api_base_url)
    if exp_host != api_host:
        return True
    return exp_port != api_port


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
    default = os.getenv("ML_AIR_RUNTIME_REALTIME_DEFAULT_URL", "").strip()
    api_base = (api_base_url or "").strip() or resolve_runtime_api_base_url(request)
    browser_ws = _realtime_ws_from_api_base(api_base) if api_base else None

    if explicit:
        if _should_rewrite_internal_realtime_url(explicit, api_base) and browser_ws:
            return browser_ws.rstrip("/")
        return explicit.rstrip("/")
    if default:
        if _should_rewrite_internal_realtime_url(default, api_base) and browser_ws:
            return browser_ws.rstrip("/")
        return default.rstrip("/")
    if browser_ws:
        return browser_ws.rstrip("/")
    return None
