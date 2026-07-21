"""Resolve browser-facing API / realtime base URLs for GET /v1/runtime-config."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from starlette.requests import Request

_INTERNAL_REALTIME_PORTS = frozenset({8001})
_INTERNAL_UPSTREAM_HOSTS = frozenset(
    {
        "mlair_api",
        "mlair-api",
        "api",
        "mlair_hub",
        "mlair_realtime",
        "mlair-hub",
        "mlair-realtime",
    }
)


def _parse_netloc(url: str) -> tuple[str, int | None]:
    raw = url.strip()
    if not raw:
        return "", None
    if "://" not in raw:
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    return (parsed.hostname or "").lower(), parsed.port


def _is_internal_service_hostname(hostname: str) -> bool:
    host = (hostname or "").strip().lower()
    if not host:
        return True
    if host in ("localhost", "127.0.0.1"):
        return False
    if host in _INTERNAL_UPSTREAM_HOSTS:
        return True
    # Docker Compose / k8s short names (no dot) are not browser-reachable.
    if "." not in host:
        return True
    return False


def _host_header_value(request: Request, header: str) -> str:
    raw = (request.headers.get(header) or "").strip()
    if not raw:
        return ""
    return raw.split(",")[0].strip()


def _public_host_from_request(request: Request) -> str | None:
    """Prefer forwarded client host; ignore internal nginx/docker upstream names."""
    forwarded_port = _host_header_value(request, "x-forwarded-port")
    for header in ("x-forwarded-host", "host"):
        host_part = _host_header_value(request, header)
        if not host_part:
            continue
        hostname, port = _parse_netloc(host_part if "://" in host_part else f"http://{host_part}")
        if not hostname or _is_internal_service_hostname(hostname):
            continue
        if port is None and forwarded_port.isdigit():
            host_part = f"{hostname}:{int(forwarded_port)}"
        return host_part
    return None


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


def _is_loopback_realtime_url(url: str) -> bool:
    host, _port = _parse_netloc(url)
    return host in ("localhost", "127.0.0.1")


def _should_rewrite_stale_loopback_realtime_url(explicit: str, api_base_url: str | None) -> bool:
    """Rewrite ws://localhost[:port] when the browser reaches API on another host/port."""
    if not _is_loopback_realtime_url(explicit):
        return False
    if not api_base_url:
        _host, port = _parse_netloc(explicit)
        return port in _INTERNAL_REALTIME_PORTS or port is None
    exp_host, exp_port = _parse_netloc(explicit)
    api_host, api_port = _parse_netloc(api_base_url)
    if exp_host != api_host:
        return True
    if exp_port in _INTERNAL_REALTIME_PORTS:
        return True
    return exp_port != api_port


def resolve_runtime_api_base_url(request: Request | None = None) -> str | None:
    explicit = os.getenv("ML_AIR_RUNTIME_API_BASE_URL", "").strip()
    if explicit:
        hostname, _port = _parse_netloc(explicit if "://" in explicit else f"http://{explicit}")
        if _is_internal_service_hostname(hostname):
            return None
        return explicit.rstrip("/")
    if request is None:
        return None
    host = _public_host_from_request(request)
    if not host:
        return None
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
        if _should_rewrite_stale_loopback_realtime_url(explicit, api_base) and browser_ws:
            return browser_ws.rstrip("/")
        return explicit.rstrip("/")
    if default:
        if _should_rewrite_stale_loopback_realtime_url(default, api_base) and browser_ws:
            return browser_ws.rstrip("/")
        return default.rstrip("/")
    if browser_ws:
        return browser_ws.rstrip("/")
    return None
