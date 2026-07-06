"""Generic lifecycle HTTP webhook for training completion / failure (Phase 4)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger("mlair.api.lifecycle_webhook")


def lifecycle_webhook_enabled() -> bool:
    return bool(str(os.getenv("ML_AIR_LIFECYCLE_WEBHOOK_URL", "") or "").strip())


def _hmac_secret() -> str:
    return str(os.getenv("ML_AIR_LIFECYCLE_WEBHOOK_HMAC_SECRET", "") or "").strip()


def _timeout_seconds() -> float:
    try:
        return float(os.getenv("ML_AIR_LIFECYCLE_WEBHOOK_TIMEOUT_SECONDS", "15"))
    except ValueError:
        return 15.0


def _sign_body(body_bytes: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _training_context_from_run(row: dict[str, Any]) -> dict[str, Any] | None:
    ov = row.get("override_config") if isinstance(row.get("override_config"), dict) else {}
    pc = row.get("plugin_context") if isinstance(row.get("plugin_context"), dict) else {}
    dvid = str(ov.get("dataset_version_id") or "").strip() or str(pc.get("dataset_version_id") or "").strip()
    if not dvid:
        return None
    return {
        "dataset_version_id": dvid,
        "model_id": str(pc.get("model_id") or pc.get("mlair_model_id") or "").strip() or None,
        "dataset_id": str(pc.get("dataset_id") or "").strip() or None,
        "pipeline_id": str(row.get("pipeline_id") or "").strip() or None,
    }


def notify_lifecycle_webhook(*, event_type: str, run_row: dict[str, Any]) -> None:
    """POST ``training.completed`` or ``training.failed`` when URL is configured."""
    url = str(os.getenv("ML_AIR_LIFECYCLE_WEBHOOK_URL", "") or "").strip()
    if not url:
        return

    ctx = _training_context_from_run(run_row)
    if ctx is None:
        return

    tenant_id = str(run_row.get("tenant_id") or "").strip()
    project_id = str(run_row.get("project_id") or "").strip()
    run_id = str(run_row.get("run_id") or "").strip()
    status = str(run_row.get("status") or "").strip().upper()
    if not tenant_id or not project_id or not run_id:
        return

    updated_at = run_row.get("updated_at")
    updated_iso = updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at or "")

    body = {
        "type": event_type,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "run_id": run_id,
        "status": status,
        "pipeline_id": ctx.get("pipeline_id"),
        "dataset_version_id": ctx["dataset_version_id"],
        "model_id": ctx.get("model_id"),
        "dataset_id": ctx.get("dataset_id"),
        "updated_at": updated_iso,
    }
    payload = json.dumps({k: v for k, v in body.items() if v is not None}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    secret = _hmac_secret()
    if secret:
        headers["X-MLAir-Signature"] = _sign_body(payload, secret)
    bearer = str(os.getenv("ML_AIR_LIFECYCLE_WEBHOOK_BEARER_TOKEN", "") or "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    req = urllib.request.Request(url, data=payload, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=_timeout_seconds()) as resp:  # noqa: S310
            raw = resp.read().decode("utf-8", errors="ignore")
            logger.info(
                "Lifecycle webhook ok type=%s run_id=%s http=%s body=%s",
                event_type,
                run_id,
                resp.status,
                raw[:500],
            )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        logger.warning(
            "Lifecycle webhook HTTP %s type=%s run_id=%s: %s",
            exc.code,
            event_type,
            run_id,
            detail[:2000],
        )
    except urllib.error.URLError as exc:
        logger.warning("Lifecycle webhook unreachable type=%s run_id=%s: %s", event_type, run_id, exc.reason)


def maybe_notify_training_lifecycle_webhook(run_row: dict[str, Any]) -> None:
    status = str(run_row.get("status") or "").strip().upper()
    if status == "SUCCESS":
        notify_lifecycle_webhook(event_type="training.completed", run_row=run_row)
    elif status == "FAILED":
        notify_lifecycle_webhook(event_type="training.failed", run_row=run_row)
