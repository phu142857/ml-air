"""ModelVersion aggregate emits Domain Events.

This is an additive Domain layer refactor: aggregates own their event
collection and expose ``pull_events()``. No audit/webhook/timeline
side effects are introduced here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.domains.shared.events import AggregateRoot, DomainEvent


@dataclass(frozen=True)
class ModelVersionCreated(DomainEvent):
    model_id: str
    model_version_id: str
    version: int
    stage: str


@dataclass(frozen=True)
class ModelVersionApproved(DomainEvent):
    model_id: str
    model_version_id: str
    version: int
    reason: Optional[str]


@dataclass(frozen=True)
class ModelVersionRejected(DomainEvent):
    model_id: str
    model_version_id: str
    version: int
    reason: Optional[str]


@dataclass(frozen=True)
class ModelVersionPromoted(DomainEvent):
    model_id: str
    model_version_id: str
    version: int
    from_stage: str
    to_stage: str
    approval_status: Optional[str]


@dataclass(frozen=True)
class ModelVersionRollback(DomainEvent):
    model_id: str
    model_version_id: str
    version: int
    from_stage: str
    to_stage: str
    approval_status: Optional[str]


@dataclass(frozen=True)
class ModelVersionDeleted(DomainEvent):
    model_id: str
    model_version_id: str
    version: int


class ModelVersionAggregate(AggregateRoot):
    """Aggregate root for Model Version lifecycle state."""

    def __init__(
        self,
        *,
        model_id: str,
        model_version_id: str,
        version: int,
        stage: str,
        approval_status: Optional[str] = None,
    ) -> None:
        super().__init__()
        self.model_id = model_id
        self.model_version_id = model_version_id
        self.version = version
        self.stage = stage
        self.approval_status = approval_status
        self.is_deleted = False

    def mark_created(self) -> None:
        self._emit(
            ModelVersionCreated(
                model_id=self.model_id,
                model_version_id=self.model_version_id,
                version=self.version,
                stage=self.stage,
            )
        )

    def approve(self, *, reason: Optional[str] = None) -> None:
        self.approval_status = "approved"
        self._emit(
            ModelVersionApproved(
                model_id=self.model_id,
                model_version_id=self.model_version_id,
                version=self.version,
                reason=reason,
            )
        )

    def reject(self, *, reason: Optional[str] = None) -> None:
        self.approval_status = "rejected"
        self._emit(
            ModelVersionRejected(
                model_id=self.model_id,
                model_version_id=self.model_version_id,
                version=self.version,
                reason=reason,
            )
        )

    def promote(self, *, to_stage: str) -> None:
        from_stage = self.stage
        self.stage = to_stage
        self._emit(
            ModelVersionPromoted(
                model_id=self.model_id,
                model_version_id=self.model_version_id,
                version=self.version,
                from_stage=from_stage,
                to_stage=to_stage,
                approval_status=self.approval_status,
            )
        )

    def rollback(self, *, to_stage: str) -> None:
        from_stage = self.stage
        self.stage = to_stage
        self._emit(
            ModelVersionRollback(
                model_id=self.model_id,
                model_version_id=self.model_version_id,
                version=self.version,
                from_stage=from_stage,
                to_stage=to_stage,
                approval_status=self.approval_status,
            )
        )

    def mark_deleted(self) -> None:
        self.is_deleted = True
        self._emit(
            ModelVersionDeleted(
                model_id=self.model_id,
                model_version_id=self.model_version_id,
                version=self.version,
            )
        )

