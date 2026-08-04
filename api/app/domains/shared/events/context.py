"""Application-level context carried alongside a business event."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ActorRef:
    """Actor that triggered the event in the current request."""

    actor_type: str  # USER | SERVICE_ACCOUNT | SYSTEM
    actor_id: str | None = None
    actor_name: str | None = None


@dataclass(frozen=True)
class EventContext:
    """Request context metadata (not part of business event payload)."""

    tenant_id: str
    project_id: str | None
    actor: ActorRef | None
    correlation_id: str | None
    ip: str | None
    user_agent: str | None

