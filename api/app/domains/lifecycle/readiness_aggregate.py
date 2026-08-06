"""Readiness aggregate emits Domain Events (Phase 2 Epic 3)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from app.domains.shared.events import AggregateRoot, DomainEvent


@dataclass(frozen=True)
class ReadinessEvaluated(DomainEvent):
    """A new persisted readiness evaluation row (not a dedupe hit)."""

    evaluation_id: str
    dataset_id: str
    dataset_version_id: Optional[str]
    policy_id: Optional[str]
    status: str
    source: str
    required_size: int
    current_size: int
    reasons: tuple[Any, ...] = ()


class ReadinessAggregate(AggregateRoot):
    """Aggregate root for dataset readiness evaluation persistence."""

    def __init__(self, *, dataset_id: str) -> None:
        super().__init__()
        self.dataset_id = dataset_id

    def mark_evaluated(
        self,
        *,
        evaluation_id: str,
        dataset_version_id: str | None,
        policy_id: str | None,
        status: str,
        source: str,
        required_size: int,
        current_size: int,
        reasons: list[Any] | tuple[Any, ...] | None = None,
    ) -> None:
        raw = reasons or []
        self._emit(
            ReadinessEvaluated(
                evaluation_id=str(evaluation_id),
                dataset_id=self.dataset_id,
                dataset_version_id=dataset_version_id,
                policy_id=policy_id,
                status=str(status or "blocked"),
                source=str(source or "manual"),
                required_size=int(required_size or 0),
                current_size=int(current_size or 0),
                reasons=tuple(raw) if not isinstance(raw, tuple) else raw,
            )
        )
