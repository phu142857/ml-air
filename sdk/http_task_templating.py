"""Jinja2 + JSONPath rendering for HTTP pipeline tasks."""

from __future__ import annotations

import json
import re
from typing import Any

_JINJA_ENV = None
_JSONPATH_RE = re.compile(r"^\$(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\]|\['[^']+'\]|\[\"[^\"]+\"\])*$")


def _jinja_env():
    global _JINJA_ENV
    if _JINJA_ENV is not None:
        return _JINJA_ENV
    try:
        from jinja2 import Environment, StrictUndefined, select_autoescape
    except ImportError as exc:
        raise RuntimeError("jinja2_required_for_http_task_templates") from exc
    _JINJA_ENV = Environment(
        autoescape=select_autoescape(default=False),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return _JINJA_ENV


def build_template_context(context: dict[str, Any], environ: dict[str, str] | None = None) -> dict[str, Any]:
    """Variables available in ``{{ ... }}`` for url, headers, and json_body."""
    ctx = context or {}
    params = ctx.get("params") if isinstance(ctx.get("params"), dict) else {}
    template_env: dict[str, str] = {}
    if environ:
        for key, val in environ.items():
            if key.startswith("MLAIR_HTTP_TEMPLATE_") or key.startswith("MLAIR_HTTP_TASK_"):
                template_env[key] = str(val)
    return {
        "run_id": ctx.get("run_id"),
        "task_id": ctx.get("task_id"),
        "tenant_id": ctx.get("tenant_id"),
        "project_id": ctx.get("project_id"),
        "pipeline_id": ctx.get("pipeline_id"),
        "trace_id": ctx.get("trace_id"),
        "attempt": ctx.get("attempt"),
        "context": ctx,
        "params": params,
        "metrics": ctx.get("metrics"),
        "lineage": ctx.get("lineage"),
        "artifacts": ctx.get("artifacts"),
        "env": template_env,
    }


def contains_template_syntax(value: Any) -> bool:
    if isinstance(value, str):
        return "{{" in value or "{%" in value
    if isinstance(value, dict):
        return any(contains_template_syntax(v) for v in value.values())
    if isinstance(value, list):
        return any(contains_template_syntax(v) for v in value)
    return False


def render_template_string(template: str, template_ctx: dict[str, Any]) -> str:
    env = _jinja_env()
    return env.from_string(template).render(**template_ctx)


def render_template_value(value: Any, template_ctx: dict[str, Any]) -> Any:
    if isinstance(value, str) and ("{{" in value or "{%" in value):
        rendered = render_template_string(value, template_ctx)
        if rendered.strip().startswith(("{", "[")):
            try:
                return json.loads(rendered)
            except json.JSONDecodeError:
                return rendered
        return rendered
    if isinstance(value, dict):
        return {str(k): render_template_value(v, template_ctx) for k, v in value.items()}
    if isinstance(value, list):
        return [render_template_value(v, template_ctx) for v in value]
    return value


def validate_jsonpath_expr(expr: str) -> bool:
    raw = str(expr or "").strip()
    if raw in ("", "$"):
        return True
    return bool(_JSONPATH_RE.match(raw))


def resolve_jsonpath(root: Any, expr: str) -> Any:
    """Resolve a limited JSONPath subset: ``$``, ``$.params``, ``$.a.b``, ``$.items[0].id``."""
    raw = str(expr or "").strip()
    if raw in ("", "$"):
        return root
    if not validate_jsonpath_expr(raw):
        raise ValueError(f"unsupported_jsonpath:{raw}")
    cur: Any = root
    rest = raw[1:]
    if rest.startswith("."):
        rest = rest[1:]
    i = 0
    while i < len(rest):
        if rest[i] == ".":
            i += 1
            continue
        if rest[i] == "[":
            close = rest.find("]", i)
            if close < 0:
                raise ValueError(f"unclosed_jsonpath_index:{raw}")
            token = rest[i + 1 : close].strip().strip("'\"")
            if isinstance(cur, list):
                cur = cur[int(token)]
            elif isinstance(cur, dict):
                cur = cur[token]
            else:
                raise KeyError(token)
            i = close + 1
            continue
        j = i
        while j < len(rest) and rest[j] not in ".[":
            j += 1
        key = rest[i:j]
        if not key:
            break
        if isinstance(cur, dict):
            cur = cur[key]
        else:
            raise KeyError(key)
        i = j
    return cur


def resolve_json_body(
    http_cfg: dict[str, Any],
    context: dict[str, Any],
    template_ctx: dict[str, Any],
) -> Any | None:
    """Build request JSON from optional JSONPath base + template json_body."""
    base: Any = {}
    jp = str(http_cfg.get("json_body_jsonpath") or http_cfg.get("body_jsonpath") or "").strip()
    if jp:
        base = resolve_jsonpath(context, jp)
        if not isinstance(base, (dict, list)):
            base = {"value": base}
    body_tpl = http_cfg.get("json_body")
    if body_tpl is None:
        return base if jp else None
    rendered = render_template_value(body_tpl, template_ctx)
    if isinstance(base, dict) and isinstance(rendered, dict):
        merged = dict(base)
        merged.update(rendered)
        return merged
    if jp:
        return rendered if rendered is not None else base
    return rendered


def render_http_config(
    http_cfg: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
    environ: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Return a copy of http_cfg with url, headers, and json_body rendered."""
    ctx = context or {}
    template_ctx = build_template_context(ctx, environ)
    out = dict(http_cfg)
    url = str(out.get("url") or "")
    if contains_template_syntax(url):
        out["url"] = render_template_string(url, template_ctx)
    headers = out.get("headers")
    if isinstance(headers, dict):
        out["headers"] = render_template_value(headers, template_ctx)
    body = resolve_json_body(out, ctx, template_ctx)
    if body is not None:
        out["json_body"] = body
    return out


def validate_http_templates(http_cfg: dict[str, Any], *, sample_context: dict[str, Any] | None = None) -> list[str]:
    """Syntax-check templates with optional dry-run context."""
    errors: list[str] = []
    jp = str(http_cfg.get("json_body_jsonpath") or http_cfg.get("body_jsonpath") or "").strip()
    if jp and not validate_jsonpath_expr(jp):
        errors.append(f"invalid json_body_jsonpath: {jp}")
    ctx = sample_context or {
        "run_id": "sample-run",
        "task_id": "sample-task",
        "tenant_id": "default",
        "project_id": "default_project",
        "pipeline_id": "sample-pipeline",
        "trace_id": "sample-trace",
        "params": {},
    }
    try:
        render_http_config(http_cfg, context=ctx, environ={})
    except Exception as exc:  # noqa: BLE001
        errors.append(f"template_render_failed: {exc}")
    return errors
