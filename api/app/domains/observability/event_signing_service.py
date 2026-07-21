"""Semantic event signing for publish path."""

from __future__ import annotations

from typing import Any

from sdk import event_signing


def signing_enabled() -> bool:
    return event_signing.signing_enabled()


def sign_event(event: dict[str, Any]) -> dict[str, Any]:
    return event_signing.sign_semantic_event(event)


def verify_event(event: dict[str, Any]) -> bool:
    return event_signing.verify_semantic_event(event)
