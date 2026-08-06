"""Run aggregate emits Domain Events for run lifecycle (Phase 2 Epic 2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.domains.shared.events import AggregateRoot, DomainEvent


@dataclass(frozen=True)
class RunCreated(DomainEvent):
    run_id: str
    pipeline_id: str
    status: str


@dataclass(frozen=True)
class RunStarted(DomainEvent):
    run_id: str
    pipeline_id: str
    from_status: str
    to_status: str = "RUNNING"


@dataclass(frozen=True)
class RunCompleted(DomainEvent):
    run_id: str
    pipeline_id: str
    from_status: str
    to_status: str = "SUCCESS"


@dataclass(frozen=True)
class RunFailed(DomainEvent):
    run_id: str
    pipeline_id: str
    from_status: str
    to_status: str = "FAILED"
    reason: Optional[str] = None


@dataclass(frozen=True)
class RunCancelled(DomainEvent):
    run_id: str
    pipeline_id: str
    from_status: str
    to_status: str = "CANCELLED"


class RunAggregate(AggregateRoot):
    """Aggregate root for Run lifecycle status transitions."""

    def __init__(
        self,
        *,
        run_id: str,
        pipeline_id: str,
        status: str,
    ) -> None:
        super().__init__()
        self.run_id = run_id
        self.pipeline_id = pipeline_id
        self.status = str(status or "").strip().upper() or "PENDING"

    def mark_created(self) -> None:
        self.status = "PENDING"
        self._emit(
            RunCreated(
                run_id=self.run_id,
                pipeline_id=self.pipeline_id,
                status="PENDING",
            )
        )

    def start(self, *, from_status: str | None = None) -> None:
        prior = str(from_status or self.status or "PENDING").strip().upper()
        self.status = "RUNNING"
        self._emit(
            RunStarted(
                run_id=self.run_id,
                pipeline_id=self.pipeline_id,
                from_status=prior,
                to_status="RUNNING",
            )
        )

    def complete(self, *, from_status: str | None = None) -> None:
        prior = str(from_status or self.status or "RUNNING").strip().upper()
        self.status = "SUCCESS"
        self._emit(
            RunCompleted(
                run_id=self.run_id,
                pipeline_id=self.pipeline_id,
                from_status=prior,
                to_status="SUCCESS",
            )
        )

    def fail(self, *, from_status: str | None = None, reason: str | None = None) -> None:
        prior = str(from_status or self.status or "RUNNING").strip().upper()
        self.status = "FAILED"
        self._emit(
            RunFailed(
                run_id=self.run_id,
                pipeline_id=self.pipeline_id,
                from_status=prior,
                to_status="FAILED",
                reason=reason,
            )
        )

    def cancel(self, *, from_status: str | None = None) -> None:
        prior = str(from_status or self.status or "RUNNING").strip().upper()
        self.status = "CANCELLED"
        self._emit(
            RunCancelled(
                run_id=self.run_id,
                pipeline_id=self.pipeline_id,
                from_status=prior,
                to_status="CANCELLED",
            )
        )

    def apply_status_transition(
        self,
        *,
        to_status: str,
        from_status: str | None = None,
        reason: str | None = None,
    ) -> None:
        """Emit the Domain Event matching ``to_status`` (idempotent no-op if unknown)."""
        target = str(to_status or "").strip().upper()
        if target == "CANCELED":
            target = "CANCELLED"
        if target == "RUNNING":
            self.start(from_status=from_status)
        elif target == "SUCCESS":
            self.complete(from_status=from_status)
        elif target == "FAILED":
            self.fail(from_status=from_status, reason=reason)
        elif target == "CANCELLED":
            self.cancel(from_status=from_status)
