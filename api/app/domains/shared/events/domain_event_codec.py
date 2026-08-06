"""Serialize / deserialize Domain Event envelopes for durable outbox storage."""

from __future__ import annotations

from dataclasses import asdict, fields
from datetime import datetime
from typing import Any

from app.domains.shared.events.context import ActorRef, EventContext
from app.domains.shared.events.domain_event import DomainEvent
from app.domains.shared.events.domain_event_registry import event_class_for_type
from app.domains.shared.events.envelope import EventEnvelope


def _actor_to_dict(actor: ActorRef | None) -> dict[str, Any] | None:
    if actor is None:
        return None
    return {
        "actor_type": actor.actor_type,
        "actor_id": actor.actor_id,
        "actor_name": actor.actor_name,
    }


def _actor_from_dict(raw: dict[str, Any] | None) -> ActorRef | None:
    if not raw:
        return None
    return ActorRef(
        actor_type=str(raw.get("actor_type") or "SYSTEM"),
        actor_id=raw.get("actor_id"),
        actor_name=raw.get("actor_name"),
    )


def _context_to_dict(ctx: EventContext) -> dict[str, Any]:
    return {
        "tenant_id": ctx.tenant_id,
        "project_id": ctx.project_id,
        "actor": _actor_to_dict(ctx.actor),
        "correlation_id": ctx.correlation_id,
        "ip": ctx.ip,
        "user_agent": ctx.user_agent,
        "request_id": ctx.request_id,
    }


def _context_from_dict(raw: dict[str, Any]) -> EventContext:
    return EventContext(
        tenant_id=str(raw.get("tenant_id") or ""),
        project_id=raw.get("project_id"),
        actor=_actor_from_dict(raw.get("actor") if isinstance(raw.get("actor"), dict) else None),
        correlation_id=raw.get("correlation_id"),
        ip=raw.get("ip"),
        user_agent=raw.get("user_agent"),
        request_id=raw.get("request_id"),
    )


def _event_to_dict(event: DomainEvent) -> dict[str, Any]:
    return {"__type__": type(event).__name__, **asdict(event)}


def _event_from_dict(raw: dict[str, Any]) -> DomainEvent:
    event_type = str(raw.pop("__type__", "") or "").strip()
    cls = event_class_for_type(event_type)
    if cls is None:
        raise ValueError(f"unknown_domain_event_type:{event_type}")
    allowed = {f.name for f in fields(cls)}
    payload = {k: v for k, v in raw.items() if k in allowed}
    return cls(**payload)  # type: ignore[call-arg]


def serialize_envelope(envelope: EventEnvelope) -> dict[str, Any]:
    return {
        "event_id": envelope.event_id,
        "event_version": envelope.event_version,
        "occurred_at": envelope.occurred_at.isoformat(),
        "event": _event_to_dict(envelope.event),
        "context": _context_to_dict(envelope.context),
    }


def deserialize_envelope(raw: dict[str, Any]) -> EventEnvelope:
    event_raw = raw.get("event")
    if not isinstance(event_raw, dict):
        raise ValueError("envelope_missing_event")
    ctx_raw = raw.get("context")
    if not isinstance(ctx_raw, dict):
        raise ValueError("envelope_missing_context")
    occurred_raw = raw.get("occurred_at")
    if isinstance(occurred_raw, datetime):
        occurred_at = occurred_raw
    else:
        occurred_at = datetime.fromisoformat(str(occurred_raw).replace("Z", "+00:00"))
    return EventEnvelope(
        event_id=str(raw.get("event_id") or ""),
        event_version=int(raw.get("event_version") or 1),
        occurred_at=occurred_at,
        event=_event_from_dict(dict(event_raw)),
        context=_context_from_dict(ctx_raw),
    )
