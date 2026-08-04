"""Pipeline aggregate emits Domain Events."""

from __future__ import annotations

from dataclasses import dataclass

from app.domains.shared.events import AggregateRoot, DomainEvent


@dataclass(frozen=True)
class PipelineVersionCreated(DomainEvent):
    pipeline_id: str
    pipeline_version_id: str
    version: int


class PipelineAggregate(AggregateRoot):
    """Aggregate root for pipeline versions (Phase 1)."""

    def __init__(self, *, pipeline_id: str) -> None:
        super().__init__()
        self.pipeline_id = pipeline_id

    def mark_pipeline_version_created(self, *, pipeline_version_id: str, version: int) -> None:
        self._emit(
            PipelineVersionCreated(
                pipeline_id=self.pipeline_id,
                pipeline_version_id=pipeline_version_id,
                version=version,
            )
        )

