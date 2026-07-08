"""Fetch and normalize OpenTelemetry spans from Grafana Tempo for the trace explorer."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from app.domains.observability.trace_service import canonical_trace_id, trace_id_lookup_candidates

logger = logging.getLogger("mlair.api.trace_tempo")

_ATTR_BOOL_OFF = frozenset({"0", "false", "off", "no", "none"})


def trace_otel_spans_enabled() -> bool:
    return os.getenv("ML_AIR_TRACE_OTEL_SPANS", "1").strip().lower() not in _ATTR_BOOL_OFF


def tempo_query_base_url() -> str | None:
    raw = os.getenv("ML_AIR_TEMPO_QUERY_URL", "http://tempo:3200").strip()
    if not raw or raw.lower() in _ATTR_BOOL_OFF:
        return None
    return raw.rstrip("/")


def _nano_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    try:
        nano = int(value)
    except (TypeError, ValueError):
        return None
    if nano <= 0:
        return None
    return datetime.fromtimestamp(nano / 1_000_000_000, tz=timezone.utc).isoformat()


def _attr_value(raw: dict[str, Any]) -> Any:
    if not isinstance(raw, dict):
        return None
    for key in ("stringValue", "boolValue", "intValue", "doubleValue"):
        if key in raw:
            return raw[key]
    if "arrayValue" in raw:
        return raw["arrayValue"]
    return None


def _attrs_to_dict(attrs: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if not isinstance(attrs, list):
        return out
    for item in attrs:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        val = _attr_value(item.get("value") or {})
        if val is not None:
            out[key] = val
    return out


def _span_status_code(status: Any) -> str:
    if not isinstance(status, dict):
        return "PENDING"
    code = str(status.get("code") or "").upper()
    if "ERROR" in code:
        return "FAILED"
    if "OK" in code:
        return "SUCCESS"
    return "PENDING"


def _hex_span_id(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return raw.replace("-", "")


def _service_name(resource: dict[str, Any]) -> str:
    attrs = _attrs_to_dict(resource.get("attributes"))
    for key in ("service.name", "service_name", "otel.service.name"):
        val = attrs.get(key)
        if val:
            return str(val)
    return "unknown"


def _parse_tempo_batches(payload: Any, trace_id: str) -> dict[str, Any] | None:
    batches: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        batches = payload.get("batches") or []
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict) and item.get("batches"):
                batches.extend(item.get("batches") or [])
            elif isinstance(item, dict) and item.get("resourceSpans"):
                batches.append(item)
    if not batches:
        return None

    spans: list[dict[str, Any]] = []
    for batch in batches:
        if not isinstance(batch, dict):
            continue
        resource = batch.get("resource") or {}
        service = _service_name(resource)
        scope_spans = batch.get("scopeSpans") or batch.get("instrumentationLibrarySpans") or []
        for scope_block in scope_spans:
            if not isinstance(scope_block, dict):
                continue
            for span in scope_block.get("spans") or []:
                if not isinstance(span, dict):
                    continue
                span_id = _hex_span_id(span.get("spanId") or span.get("span_id"))
                if not span_id:
                    continue
                start_nano = span.get("startTimeUnixNano") or span.get("start_time_unix_nano")
                end_nano = span.get("endTimeUnixNano") or span.get("end_time_unix_nano")
                start_dt = None
                end_dt = None
                try:
                    if start_nano is not None:
                        start_dt = datetime.fromtimestamp(int(start_nano) / 1_000_000_000, tz=timezone.utc)
                    if end_nano is not None:
                        end_dt = datetime.fromtimestamp(int(end_nano) / 1_000_000_000, tz=timezone.utc)
                except (TypeError, ValueError):
                    start_dt = None
                    end_dt = None
                duration_ms: int | None = None
                if start_dt and end_dt and end_dt >= start_dt:
                    duration_ms = int((end_dt - start_dt).total_seconds() * 1000)
                attrs = _attrs_to_dict(span.get("attributes"))
                spans.append(
                    {
                        "span_id": span_id,
                        "parent_span_id": _hex_span_id(span.get("parentSpanId") or span.get("parent_span_id")) or None,
                        "name": str(span.get("name") or attrs.get("http.route") or "span"),
                        "service": service,
                        "kind": str(span.get("kind") or ""),
                        "status": _span_status_code(span.get("status")),
                        "start_ts": _nano_to_iso(start_nano),
                        "end_ts": _nano_to_iso(end_nano),
                        "duration_ms": duration_ms,
                        "attributes": attrs,
                    }
                )
    if not spans:
        return None
    return _finalize_span_tree(spans, trace_id)


def _finalize_span_tree(spans: list[dict[str, Any]], trace_id: str) -> list[dict[str, Any]]:
    by_id = {s["span_id"]: s for s in spans}
    children: dict[str, list[str]] = defaultdict(list)
    roots: list[str] = []
    for span in spans:
        parent = span.get("parent_span_id")
        if parent and parent in by_id and parent != span["span_id"]:
            children[parent].append(span["span_id"])
        else:
            roots.append(span["span_id"])

    for pid in children:
        children[pid].sort(key=lambda sid: str(by_id[sid].get("start_ts") or ""))
    roots.sort(key=lambda sid: str(by_id[sid].get("start_ts") or ""))

    ordered: list[dict[str, Any]] = []

    def walk(span_id: str, depth: int, ancestors_last: list[bool]) -> None:
        span = by_id[span_id]
        parent_id = span.get("parent_span_id")
        if depth == 0:
            sibs = roots
        else:
            sibs = children.get(str(parent_id or ""), [])
        is_last = sibs[-1] == span_id if sibs else True
        prefix = ""
        if depth > 0:
            for idx, last in enumerate(ancestors_last):
                prefix += "   " if last else "│  "
            prefix += "└─ " if is_last else "├─ "
        span["depth"] = depth
        span["tree_prefix"] = prefix.rstrip()
        ordered.append(span)
        for child_id in children.get(span_id, []):
            walk(child_id, depth + 1, ancestors_last + [is_last])

    for root_id in roots:
        walk(root_id, 0, [])

    starts = [s.get("start_ts") for s in ordered if s.get("start_ts")]
    anchor_iso = min(starts) if starts else None
    anchor_dt = None
    if anchor_iso:
        try:
            anchor_dt = datetime.fromisoformat(anchor_iso.replace("Z", "+00:00"))
        except ValueError:
            anchor_dt = None

    total_ms = 0
    for span in ordered:
        start_dt = None
        end_dt = None
        if span.get("start_ts"):
            try:
                start_dt = datetime.fromisoformat(str(span["start_ts"]).replace("Z", "+00:00"))
            except ValueError:
                start_dt = None
        if span.get("end_ts"):
            try:
                end_dt = datetime.fromisoformat(str(span["end_ts"]).replace("Z", "+00:00"))
            except ValueError:
                end_dt = None
        offset_ms = int((start_dt - anchor_dt).total_seconds() * 1000) if anchor_dt and start_dt else 0
        width_ms = span.get("duration_ms")
        if width_ms is None and start_dt and end_dt and end_dt >= start_dt:
            width_ms = int((end_dt - start_dt).total_seconds() * 1000)
        width_ms = max(1, int(width_ms or 1))
        span["offset_ms"] = offset_ms
        span["width_ms"] = width_ms
        span["end_offset_ms"] = offset_ms + width_ms
        span["is_instant"] = False
        total_ms = max(total_ms, offset_ms + width_ms)

    services = sorted({str(s.get("service") or "") for s in ordered if s.get("service")})
    return {
        "trace_id": canonical_trace_id(trace_id) or trace_id,
        "anchor_ts": anchor_iso,
        "total_ms": total_ms,
        "services": services,
        "spans": ordered,
        "span_count": len(ordered),
    }


def _fetch_tempo_trace_hex(base_url: str, trace_hex: str, timeout_sec: float = 4.0) -> dict[str, Any] | None:
    url = f"{base_url}/api/traces/{trace_hex}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:  # noqa: S310
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        logger.debug("tempo_trace_http_error trace=%s code=%s", trace_hex[:16], exc.code)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.debug("tempo_trace_fetch_failed trace=%s err=%s", trace_hex[:16], exc)
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.debug("tempo_trace_json_failed trace=%s err=%s", trace_hex[:16], exc)
        return None
    return _parse_tempo_batches(payload, trace_hex)


def fetch_tempo_trace(*, trace_id: str) -> dict[str, Any] | None:
    """Load OTLP spans for ``trace_id`` from Tempo when enabled."""
    if not trace_otel_spans_enabled():
        return None
    base = tempo_query_base_url()
    if not base:
        return None

    candidates = trace_id_lookup_candidates(trace_id)
    seen: set[str] = set()
    for cand in candidates:
        hex_id = cand.replace("-", "").lower()
        if len(hex_id) < 16 or hex_id in seen:
            continue
        seen.add(hex_id)
        result = _fetch_tempo_trace_hex(base, hex_id)
        if result and result.get("spans"):
            return result
    return None
