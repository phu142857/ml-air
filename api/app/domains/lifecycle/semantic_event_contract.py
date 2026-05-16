"""Semantic event envelope validation (Phase 8 contract kit)."""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger("mlair.lifecycle.semantic_event_contract")

_SCHEMA_NAME = "mlair-semantic-event-v1.schema.json"


@lru_cache(maxsize=1)
def _load_schema() -> dict[str, Any]:
    candidates = [
        Path(__file__).resolve().parents[2] / "schemas" / _SCHEMA_NAME,
        Path(__file__).resolve().parents[3].parent / "sdk" / "schemas" / _SCHEMA_NAME,
    ]
    for path in candidates:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"semantic event schema not found: {_SCHEMA_NAME}")


def strict_validation_enabled() -> bool:
    return os.getenv("ML_AIR_SEMANTIC_EVENT_VALIDATE", "").strip() == "1"


def validate_semantic_event(event: dict[str, Any]) -> None:
    from jsonschema import validate

    validate(instance=event, schema=_load_schema())


def validate_semantic_event_if_enabled(event: dict[str, Any]) -> bool:
    """Validate when ``ML_AIR_SEMANTIC_EVENT_VALIDATE=1``. Returns False if invalid (logged)."""
    if not strict_validation_enabled():
        return True
    try:
        validate_semantic_event(event)
        return True
    except Exception as exc:
        from jsonschema import ValidationError

        if not isinstance(exc, ValidationError):
            raise
        logger.warning(
            "semantic_event_invalid type=%s event_id=%s err=%s",
            event.get("type"),
            event.get("event_id"),
            exc.message,
        )
        return False
