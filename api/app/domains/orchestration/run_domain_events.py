"""Helpers to publish Run Domain Events after persist (API + scheduler)."""

from __future__ import annotations

from typing import Any

from app.domains.orchestration.run_aggregate import RunAggregate
from app.domains.shared.events import build_event_context, get_event_bus


def publish_run_lifecycle_events(
    *,
    session: Any,
    tenant_id: str,
    project_id: str,
    run_id: str,
    pipeline_id: str,
    status: str,
    from_status: str | None = None,
    reason: str | None = None,
    created: bool = False,
) -> None:
    """Emit Run Domain Events for create or status transition; publish on ``session``."""
    agg = RunAggregate(
        run_id=str(run_id),
        pipeline_id=str(pipeline_id or ""),
        status=str(from_status or status or "PENDING"),
    )
    if created:
        agg.mark_created()
    else:
        agg.apply_status_transition(
            to_status=status,
            from_status=from_status,
            reason=reason,
        )
    events = agg.pull_events()
    if not events:
        return
    ctx = build_event_context(tenant_id=str(tenant_id), project_id=str(project_id))
    get_event_bus().publish_all(events, context=ctx, session=session)
