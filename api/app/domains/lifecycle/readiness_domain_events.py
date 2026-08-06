"""Publish Readiness Domain Events after persist."""

from __future__ import annotations

from typing import Any

from app.domains.lifecycle.readiness_aggregate import ReadinessAggregate
from app.domains.shared.events import build_event_context, get_event_bus


def publish_readiness_evaluated(
    *,
    session: Any,
    tenant_id: str,
    project_id: str,
    evaluation_id: str,
    dataset_id: str,
    dataset_version_id: str | None,
    policy_id: str | None,
    status: str,
    source: str,
    required_size: int,
    current_size: int,
    reasons: list[Any] | None = None,
) -> None:
    agg = ReadinessAggregate(dataset_id=str(dataset_id))
    agg.mark_evaluated(
        evaluation_id=evaluation_id,
        dataset_version_id=dataset_version_id,
        policy_id=policy_id,
        status=status,
        source=source,
        required_size=required_size,
        current_size=current_size,
        reasons=reasons,
    )
    events = agg.pull_events()
    if not events:
        return
    ctx = build_event_context(tenant_id=str(tenant_id), project_id=str(project_id))
    get_event_bus().publish_all(events, context=ctx, session=session)
