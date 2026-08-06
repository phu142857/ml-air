"""Request-scoped EventContext bindings (Phase 2 Epic 1).

HTTP middleware binds IP / User-Agent / request_id / correlation_id.
``authenticate_bearer`` binds ``ActorRef`` from the authenticated principal.
Application services call ``build_event_context(...)`` instead of hard-coding
``actor=None``.
"""

from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any
from uuid import uuid4

from app.domains.observability.trace_service import get_trace_id
from app.domains.shared.events.context import ActorRef, EventContext

_actor_ctx: ContextVar[ActorRef | None] = ContextVar("mlair_event_actor", default=None)
_correlation_ctx: ContextVar[str | None] = ContextVar("mlair_event_correlation_id", default=None)
_request_id_ctx: ContextVar[str | None] = ContextVar("mlair_event_request_id", default=None)
_ip_ctx: ContextVar[str | None] = ContextVar("mlair_event_ip", default=None)
_user_agent_ctx: ContextVar[str | None] = ContextVar("mlair_event_user_agent", default=None)


def get_bound_actor() -> ActorRef | None:
    return _actor_ctx.get()


def set_bound_actor(actor: ActorRef | None) -> Token:
    return _actor_ctx.set(actor)


def get_bound_correlation_id() -> str | None:
    return _correlation_ctx.get()


def get_bound_request_id() -> str | None:
    return _request_id_ctx.get()


def get_bound_ip() -> str | None:
    return _ip_ctx.get()


def get_bound_user_agent() -> str | None:
    return _user_agent_ctx.get()


def reset_event_request_context() -> None:
    """Clear all request-scoped event bindings (call from middleware finally)."""
    _actor_ctx.set(None)
    _correlation_ctx.set(None)
    _request_id_ctx.set(None)
    _ip_ctx.set(None)
    _user_agent_ctx.set(None)


def bind_http_request_meta(request: Any) -> None:
    """Bind transport metadata from a Starlette/FastAPI request.

    Does not set actor — that happens after authentication.
    """
    headers = getattr(request, "headers", {}) or {}
    raw_request_id = (headers.get("x-request-id") or "").strip()
    raw_correlation = (headers.get("x-correlation-id") or "").strip()
    request_id = raw_request_id or raw_correlation or str(uuid4())
    correlation = raw_correlation or (headers.get("x-trace-id") or "").strip() or get_trace_id()

    ip: str | None = None
    xff = (headers.get("x-forwarded-for") or "").strip()
    if xff:
        ip = xff.split(",")[0].strip() or None
    if not ip:
        client = getattr(request, "client", None)
        if client is not None:
            ip = getattr(client, "host", None)

    ua = (headers.get("user-agent") or "").strip() or None

    _actor_ctx.set(None)
    _request_id_ctx.set(request_id)
    _correlation_ctx.set(correlation)
    _ip_ctx.set(ip)
    _user_agent_ctx.set(ua)


def actor_ref_from_principal(principal: Any) -> ActorRef:
    """Map an auth ``Principal`` to an immutable ``ActorRef``."""
    kind = str(getattr(principal, "principal_kind", "") or "").strip().lower()
    sa_id = getattr(principal, "service_account_id", None)
    user_id = getattr(principal, "user_id", None)
    subject = str(getattr(principal, "subject", "") or "").strip() or None

    if sa_id or kind == "service_account":
        return ActorRef(
            actor_type="SERVICE_ACCOUNT",
            actor_id=str(sa_id or subject or "").strip() or None,
            actor_name=subject,
        )

    actor_id = str(user_id or subject or "").strip() or None
    actor_name = subject
    if user_id:
        try:
            from app.domains.governance import identity_repository as identity_repo

            if identity_repo.identity_tables_available():
                user = identity_repo.get_user_by_id(str(user_id))
                if user:
                    display = str(user.get("display_name") or "").strip()
                    username = str(user.get("username") or "").strip()
                    actor_name = display or username or subject
        except Exception:
            pass

    return ActorRef(
        actor_type="USER",
        actor_id=actor_id,
        actor_name=actor_name,
    )


def bind_actor_from_principal(principal: Any) -> ActorRef:
    """Bind actor for the remainder of the request; returns the bound ref."""
    actor = actor_ref_from_principal(principal)
    _actor_ctx.set(actor)
    return actor


def build_event_context(*, tenant_id: str, project_id: str | None) -> EventContext:
    """Build ``EventContext`` from request bindings + tenant/project scope.

    When no actor is bound (background jobs), uses ``SYSTEM``.
    """
    actor = get_bound_actor()
    if actor is None:
        actor = ActorRef(actor_type="SYSTEM", actor_id=None, actor_name=None)

    correlation = get_bound_correlation_id() or get_trace_id()
    return EventContext(
        tenant_id=str(tenant_id),
        project_id=project_id,
        actor=actor,
        correlation_id=correlation,
        request_id=get_bound_request_id(),
        ip=get_bound_ip(),
        user_agent=get_bound_user_agent(),
    )
