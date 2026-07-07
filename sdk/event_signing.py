"""HMAC signing for MLAir semantic event envelopes v1."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any


def signing_enabled() -> bool:
    return os.getenv("ML_AIR_SEMANTIC_EVENT_SIGNING", "1").strip() == "1"


def _canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def _signing_keys() -> tuple[str, dict[str, str]]:
    active = os.getenv("ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID", "v1").strip() or "v1"
    single = os.getenv("ML_AIR_SEMANTIC_EVENT_SIGNING_KEY", "").strip()
    raw = os.getenv("ML_AIR_SEMANTIC_EVENT_SIGNING_KEYS_JSON", "").strip()
    keyset: dict[str, str] = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                keyset = {str(k).strip(): str(v).strip() for k, v in parsed.items() if str(k).strip() and str(v).strip()}
        except json.JSONDecodeError:
            keyset = {}
    if single and active not in keyset:
        keyset[active] = single
    if not keyset and single:
        keyset = {active: single}
    return active, keyset


def envelope_signing_payload(event: dict[str, Any]) -> dict[str, Any]:
    """Fields covered by the integrity signature (excludes ``integrity`` itself)."""
    return {
        "version": event.get("version"),
        "event_id": event.get("event_id"),
        "type": event.get("type"),
        "tenant_id": event.get("tenant_id"),
        "project_id": event.get("project_id"),
        "resource_id": event.get("resource_id"),
        "timestamp": event.get("timestamp"),
        "trace_id": event.get("trace_id"),
        "payload": event.get("payload"),
    }


def sign_semantic_event(event: dict[str, Any]) -> dict[str, Any]:
    """Attach ``integrity`` block; returns a shallow copy of *event*."""
    out = dict(event)
    active_kid, keyset = _signing_keys()
    key = keyset.get(active_kid) or os.getenv("ML_AIR_SEMANTIC_EVENT_SIGNING_KEY", "").strip()
    if not key:
        raise ValueError("semantic_event_signing_key_missing")
    msg = _canonical_json(envelope_signing_payload(out)).encode("utf-8")
    sig = hmac.new(key.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    out["integrity"] = {
        "algorithm": "hmac-sha256",
        "key_id": active_kid,
        "signature": sig,
    }
    return out


def verify_semantic_event(event: dict[str, Any], *, keys: dict[str, str] | None = None) -> bool:
    integrity = event.get("integrity")
    if not isinstance(integrity, dict):
        return False
    alg = str(integrity.get("algorithm") or "").strip().lower()
    if alg != "hmac-sha256":
        return False
    kid = str(integrity.get("key_id") or "").strip()
    sig = str(integrity.get("signature") or "").strip()
    if not kid or not sig:
        return False
    _, keyset = _signing_keys()
    if keys:
        keyset = {**keyset, **keys}
    key = keyset.get(kid, "")
    if not key:
        return False
    expected = hmac.new(
        key.encode("utf-8"),
        _canonical_json(envelope_signing_payload(event)).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, sig)
