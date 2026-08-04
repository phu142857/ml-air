"""Dataset aggregate emits Domain Events.

This aggregate is context-free and only collects domain events in-memory.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domains.shared.events import AggregateRoot, DomainEvent


@dataclass(frozen=True)
class DatasetCreated(DomainEvent):
    dataset_id: str
    name: str


@dataclass(frozen=True)
class DatasetDeleted(DomainEvent):
    dataset_id: str


class DatasetAggregate(AggregateRoot):
    def __init__(self, *, dataset_id: str, name: str) -> None:
        super().__init__()
        self.dataset_id = dataset_id
        self.name = name
        self.is_deleted = False

    def mark_created(self) -> None:
        self._emit(DatasetCreated(dataset_id=self.dataset_id, name=self.name))

    def mark_deleted(self) -> None:
        if self.is_deleted:
            return
        self.is_deleted = True
        self._emit(DatasetDeleted(dataset_id=self.dataset_id))

