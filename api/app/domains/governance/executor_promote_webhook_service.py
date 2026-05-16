"""Best-effort HTTP notify when MLAir promotes a model (MLAir → external executor / serving)."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("mlair.api.executor_promote_webhook")


def notify_model_promotion_webhook(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    artifact_uri: str | None,
    idempotency_key: str | None = None,
) -> None:
    """
    POST JSON to a configured URL so an external system can align serving with MLAir production.

    Environment:
      MLAIR_MODEL_PROMOTE_WEBHOOK_URL — full URL (POST)
      MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN — Authorization: Bearer …
      MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS — optional, default 15
    """
    url = str(os.getenv("MLAIR_MODEL_PROMOTE_WEBHOOK_URL", "") or "").strip()
    if not url:
        return
    token = str(os.getenv("MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN", "") or "").strip()
    if not token:
        logger.warning(
            "MLAIR_MODEL_PROMOTE_WEBHOOK_URL is set but MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN is empty; skip webhook"
        )
        return
    body = {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "model_id": model_id,
        "version": int(version),
        "artifact_uri": str(artifact_uri or "").strip(),
        "idempotency_key": (str(idempotency_key).strip() if idempotency_key else None),
    }
    if not body["artifact_uri"]:
        logger.info("Model promote webhook skipped: no artifact_uri for model_id=%s version=%s", model_id, version)
        return
    timeout = float(os.getenv("MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS", "15"))
    payload = json.dumps({k: v for k, v in body.items() if v is not None}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            raw = resp.read().decode("utf-8", errors="ignore")
            logger.info(
                "Model promote webhook ok model_id=%s version=%s http=%s body=%s",
                model_id,
                version,
                resp.status,
                raw[:500],
            )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        logger.warning(
            "Model promote webhook HTTP %s model_id=%s version=%s: %s",
            exc.code,
            model_id,
            version,
            detail[:2000],
        )
    except urllib.error.URLError as exc:
        logger.warning("Model promote webhook unreachable model_id=%s version=%s: %s", model_id, version, exc.reason)
