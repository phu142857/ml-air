#!/usr/bin/env python3
"""Wave 0 sign-off: runtime-config realtime defaults, realtime health, optional WS handshake, Redis TCP."""

from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from urllib.parse import urlencode, urlparse


def _http_json(url: str, timeout: float = 5.0) -> tuple[int, dict]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw or "{}")
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}


def _tcp_ok(host: str, port: int, timeout: float = 2.0) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex((host, port)) == 0


def _ws_handshake_ok(ws_base: str, tenant_id: str, project_id: str, token: str, timeout: float = 5.0) -> bool:
    """Minimal RFC6455 client: expect HTTP 101 Switching Protocols (auth may close socket after)."""
    parsed = urlparse(ws_base.strip())
    if parsed.scheme not in {"ws", "wss"}:
        return False
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "wss" else 80)
    path_base = (parsed.path or "").rstrip("/")
    qs = urlencode({"tenant_id": tenant_id, "project_id": project_id, "token": token})
    path = f"{path_base}/ws?{qs}"

    key = base64.b64encode(os.urandom(16)).decode("ascii")
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    ).encode("ascii")

    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(request)
        sock.settimeout(timeout)
        buf = b""
        while b"\r\n\r\n" not in buf and len(buf) < 8192:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
    status_line = buf.split(b"\r\n", 1)[0].decode("ascii", errors="replace")
    return " 101 " in f" {status_line} " or status_line.endswith(" 101 Switching Protocols")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify MLAir execution realtime (Wave 0).")
    parser.add_argument("--api-url", default=os.getenv("ML_AIR_BASE_URL", "http://localhost:8080"))
    parser.add_argument("--realtime-url", default=os.getenv("ML_AIR_RUNTIME_REALTIME_BASE_URL", ""))
    parser.add_argument("--realtime-port", type=int, default=int(os.getenv("MLAIR_REALTIME_PORT", "8001")))
    parser.add_argument("--tenant-id", default=os.getenv("ML_AIR_TENANT_ID", "default"))
    parser.add_argument("--project-id", default=os.getenv("ML_AIR_PROJECT_ID", "default_project"))
    parser.add_argument("--token", default=os.getenv("ML_AIR_REALTIME_VERIFY_TOKEN", "viewer-token"))
    parser.add_argument("--redis-host", default=os.getenv("ML_AIR_REDIS_HOST", "127.0.0.1"))
    parser.add_argument("--redis-port", type=int, default=int(os.getenv("ML_AIR_REDIS_PORT", "6379")))
    parser.add_argument("--skip-ws", action="store_true", help="Skip WebSocket handshake check")
    parser.add_argument(
        "--degraded",
        action="store_true",
        help="Chaos/polling mode: skip realtime /healthz and WS (API + runtime-config + Redis only)",
    )
    args = parser.parse_args()
    skip_realtime = args.degraded or args.skip_ws

    api_base = args.api_url.rstrip("/")
    failures: list[str] = []
    ws_base = args.realtime_url.strip() or f"ws://127.0.0.1:{args.realtime_port}"

    code, _ = _http_json(f"{api_base}/health")
    if code != 200:
        failures.append(f"api-health (HTTP {code})")
    else:
        print("[PASS] api-health")

    code, rc = _http_json(f"{api_base}/v1/runtime-config")
    if code != 200:
        failures.append(f"runtime-config (HTTP {code})")
    else:
        features = rc.get("features") or {}
        if features.get("realtime_enabled") is False:
            failures.append("runtime-config features.realtime_enabled=false")
        else:
            print("[PASS] runtime-config realtime_enabled")
        rt_url = str(rc.get("realtime_base_url") or "").strip()
        if not rt_url:
            failures.append("runtime-config realtime_base_url empty")
        else:
            print(f"[PASS] runtime-config realtime_base_url={rt_url}")
        ws_base = args.realtime_url.strip() or rt_url or ws_base

    if not args.degraded:
        parsed_rt = urlparse(ws_base)
        rt_host = parsed_rt.hostname or "127.0.0.1"
        rt_port = parsed_rt.port or args.realtime_port
        health_url = f"http://{rt_host}:{rt_port}/healthz"
        try:
            req = urllib.request.Request(health_url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310
                ok = 200 <= resp.status < 400
        except (urllib.error.URLError, TimeoutError, OSError):
            ok = False
        if not ok:
            failures.append(f"realtime-health ({health_url})")
        else:
            print(f"[PASS] realtime-health ({health_url})")
    else:
        print("[SKIP] realtime-health (--degraded)")

    if _tcp_ok(args.redis_host, args.redis_port):
        print(f"[PASS] redis-tcp ({args.redis_host}:{args.redis_port})")
    else:
        failures.append(f"redis-tcp ({args.redis_host}:{args.redis_port})")

    if not skip_realtime:
        if _ws_handshake_ok(ws_base, args.tenant_id, args.project_id, args.token):
            print(f"[PASS] ws-handshake ({ws_base})")
        else:
            failures.append(f"ws-handshake ({ws_base})")
    elif not args.degraded:
        print("[SKIP] ws-handshake (--skip-ws)")

    if failures:
        for name in failures:
            print(f"[FAIL] {name}", file=sys.stderr)
        print(
            "[FAIL] execution realtime verification failed — see docs/runbooks/execution-realtime-ops.md",
            file=sys.stderr,
        )
        return 1

    label = "degraded" if args.degraded else "Wave 0"
    print(f"[PASS] execution realtime verification ({label})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
