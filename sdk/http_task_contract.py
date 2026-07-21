"""HTTP pipeline task contract — validate config and execute outbound requests (executor + API)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

VALID_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"})


def http_task_allowed_hosts() -> list[str]:
    raw = os.getenv("ML_AIR_HTTP_TASK_ALLOWED_HOSTS", "").strip()
    if not raw:
        raw = os.getenv("ML_AIR_WEBHOOK_ALLOWED_HOSTS", "").strip()
    if not raw:
        return []
    return [h.strip().lower() for h in raw.split(",") if h.strip()]


def is_host_allowed(url: str, allowed_hosts: list[str] | None = None) -> bool:
    hosts = allowed_hosts if allowed_hosts is not None else http_task_allowed_hosts()
    if not hosts:
        return False
    try:
        host = (urllib.parse.urlparse(url).hostname or "").strip().lower()
    except Exception:  # noqa: BLE001
        return False
    return bool(host) and host in hosts


def normalize_http_block(item: dict[str, Any]) -> dict[str, Any] | None:
    block = item.get("http")
    if not isinstance(block, dict):
        return None
    method = str(block.get("method") or "POST").strip().upper() or "POST"
    url = str(block.get("url") or "").strip()
    headers = block.get("headers") if isinstance(block.get("headers"), dict) else {}
    body = block.get("json_body")
    if body is None and "body" in block:
        body = block.get("body")
    json_body_jsonpath = str(block.get("json_body_jsonpath") or block.get("body_jsonpath") or "").strip() or None
    timeout = block.get("timeout_seconds", block.get("timeout_sec", 30))
    secret_env = str(block.get("secret_env") or block.get("authorization_secret_env") or "").strip() or None
    return {
        "method": method,
        "url": url,
        "headers": {str(k): str(v) for k, v in headers.items()},
        "json_body": body,
        "json_body_jsonpath": json_body_jsonpath,
        "timeout_seconds": max(1, min(int(timeout), 300)),
        "secret_env": secret_env,
    }


def task_is_http(item: dict[str, Any]) -> bool:
    kind = str(item.get("type") or item.get("kind") or "").strip().lower()
    if kind == "http":
        return True
    return normalize_http_block(item) is not None


def validate_http_task_item(item: dict[str, Any], *, allowed_hosts: list[str] | None = None) -> list[str]:
    errors: list[str] = []
    task_id = str(item.get("id") or "").strip() or "<unknown>"
    block = normalize_http_block(item)
    if not block:
        errors.append(f"Task {task_id}: missing http config")
        return errors
    method = block["method"]
    if method not in VALID_METHODS:
        errors.append(f"Task {task_id}: invalid method {method}")
    url = block["url"]
    if len(url) < 8:
        errors.append(f"Task {task_id}: url required")
    else:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            errors.append(f"Task {task_id}: url must be http(s)")
        elif not is_host_allowed(url, allowed_hosts):
            errors.append(f"Task {task_id}: host not in HTTP task allowlist")
    if block.get("json_body") is not None and not isinstance(block.get("json_body"), (dict, list, str)):
        errors.append(f"Task {task_id}: json_body must be object, array, or template string")
    jp = block.get("json_body_jsonpath")
    if jp:
        try:
            from sdk.http_task_templating import validate_jsonpath_expr

            if not validate_jsonpath_expr(str(jp)):
                errors.append(f"Task {task_id}: invalid json_body_jsonpath")
        except ImportError:
            pass
    try:
        from sdk.http_task_templating import validate_http_templates

        errors.extend(validate_http_templates(block))
    except ImportError:
        pass
    return errors


def merge_context_into_body(template: Any, context: dict[str, Any]) -> Any:
    """Legacy shallow merge when templates are disabled; prefer ``render_http_config``."""
    if not isinstance(template, dict):
        return template
    out = dict(template)
    for key in ("run_id", "task_id", "tenant_id", "project_id", "pipeline_id", "trace_id"):
        if key in context and key not in out:
            out[key] = context[key]
    params = context.get("params")
    if isinstance(params, dict):
        out.setdefault("params", params)
    return out


def execute_http_task(
    http_cfg: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
    environ: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Perform one HTTP call. Returns {ok, status_code?, error?, body_preview?}."""
    ctx = context or {}
    env = environ if environ is not None else dict(os.environ)
    rendered_cfg = http_cfg
    if os.getenv("ML_AIR_HTTP_TASK_TEMPLATES", "1").strip() != "0":
        try:
            from sdk.http_task_templating import render_http_config

            rendered_cfg = render_http_config(http_cfg, context=ctx, environ=env)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"http_task_template_failed:{exc}"}
    method = str(rendered_cfg.get("method") or "POST").upper()
    url = str(rendered_cfg.get("url") or "").strip()
    if not is_host_allowed(url):
        return {"ok": False, "error": "http_task_host_not_allowed", "url": url}
    headers = dict(rendered_cfg.get("headers") or {})
    secret_env = rendered_cfg.get("secret_env")
    if secret_env:
        token = str(env.get(str(secret_env), "") or "").strip()
        if token:
            headers.setdefault("Authorization", f"Bearer {token}")
    body_bytes: bytes | None = None
    json_body = rendered_cfg.get("json_body")
    if json_body is not None and method not in ("GET", "HEAD"):
        if os.getenv("ML_AIR_HTTP_TASK_TEMPLATES", "1").strip() == "0":
            json_body = merge_context_into_body(json_body, ctx)
        body_bytes = json.dumps(json_body).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    timeout = int(rendered_cfg.get("timeout_seconds") or 30)
    req = urllib.request.Request(url=url, method=method, headers=headers, data=body_bytes)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(8192)
            preview = raw.decode("utf-8", errors="replace")[:500]
            code = int(getattr(resp, "status", None) or resp.getcode())
            ok = 200 <= code < 300
            return {
                "ok": ok,
                "status_code": code,
                "body_preview": preview,
                "error": None if ok else f"http_status_{code}",
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read(2048) if exc.fp else b""
        preview = raw.decode("utf-8", errors="replace")[:500]
        code = int(exc.code)
        retryable = code in (408, 425, 429) or 500 <= code <= 599
        return {
            "ok": False,
            "status_code": code,
            "body_preview": preview,
            "error": f"http_status_{code}",
            "retryable": retryable,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:500]}


def validate_pipeline_tasks(tasks: list[Any], *, allowed_hosts: list[str] | None = None) -> list[str]:
    errors: list[str] = []
    for item in tasks:
        if not isinstance(item, dict):
            errors.append("Task definition must be an object")
            continue
        if task_is_http(item):
            if str(item.get("plugin") or "").strip():
                errors.append(f"Task {item.get('id')}: cannot set both plugin and http")
            errors.extend(validate_http_task_item(item, allowed_hosts=allowed_hosts))
        else:
            plugin = str(item.get("plugin") or "").strip()
            if not plugin:
                errors.append(f"Task {item.get('id') or '<unknown>'}: plugin required (or set type=http)")
    return errors
