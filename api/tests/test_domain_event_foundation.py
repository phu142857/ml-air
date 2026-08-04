from __future__ import annotations

import unittest
from dataclasses import dataclass

from app.domains.shared.events import (
    ActorRef,
    DomainEvent,
    DomainEventHandler,
    EventContext,
    InProcessEventBus,
)


@dataclass(frozen=True)
class ModelVersionPromoted(DomainEvent):
    model_version_id: str
    from_stage: str
    to_stage: str


@dataclass(frozen=True)
class DatasetCreated(DomainEvent):
    dataset_id: str
    name: str

    @classmethod
    def event_version(cls) -> int:
        return 2


class _CaptureHandler(DomainEventHandler):
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    def handle(self, envelope, *, session) -> None:  # type: ignore[override]
        self.calls.append((envelope, session))


class _FailingHandler(DomainEventHandler):
    def handle(self, envelope, *, session) -> None:  # type: ignore[override]
        raise RuntimeError("handler failed")


class TestDomainEventFoundation(unittest.TestCase):
    def _context(self) -> EventContext:
        return EventContext(
            tenant_id="default",
            project_id="default_project",
            actor=ActorRef(actor_type="USER", actor_id="u1", actor_name="alice"),
            correlation_id="corr-1",
            ip="127.0.0.1",
            user_agent="pytest",
        )

    def test_inprocess_event_bus_dispatches_synchronously_with_same_session(self) -> None:
        bus = InProcessEventBus()
        h1 = _CaptureHandler()
        h2 = _CaptureHandler()
        bus.subscribe(ModelVersionPromoted, h1)
        bus.subscribe(ModelVersionPromoted, h2)

        session = object()
        event = ModelVersionPromoted(model_version_id="mv1", from_stage="staging", to_stage="production")
        bus.publish(event, context=self._context(), session=session)

        self.assertEqual(len(h1.calls), 1)
        self.assertEqual(len(h2.calls), 1)
        env1, s1 = h1.calls[0]
        env2, s2 = h2.calls[0]
        self.assertIs(s1, session)
        self.assertIs(s2, session)
        self.assertIs(env1, env2, "all handlers should receive the same envelope instance")

    def test_event_envelope_contains_required_fields(self) -> None:
        bus = InProcessEventBus()
        h = _CaptureHandler()
        bus.subscribe(DatasetCreated, h)
        event = DatasetCreated(dataset_id="ds1", name="cats")
        bus.publish(event, context=self._context(), session=object())

        envelope = h.calls[0][0]
        self.assertTrue(getattr(envelope, "event_id"))
        self.assertEqual(envelope.event_version, 2)
        self.assertIsNotNone(envelope.occurred_at)
        self.assertEqual(envelope.event, event)
        self.assertEqual(envelope.context.tenant_id, "default")

    def test_publish_all_dispatches_every_event(self) -> None:
        bus = InProcessEventBus()
        h = _CaptureHandler()
        bus.subscribe(ModelVersionPromoted, h)
        events = [
            ModelVersionPromoted(model_version_id="mv1", from_stage="dev", to_stage="staging"),
            ModelVersionPromoted(model_version_id="mv2", from_stage="staging", to_stage="production"),
        ]
        bus.publish_all(events, context=self._context(), session=object())
        self.assertEqual(len(h.calls), 2)

    def test_handler_exception_bubbles_for_transaction_rollback(self) -> None:
        bus = InProcessEventBus()
        bus.subscribe(ModelVersionPromoted, _FailingHandler())
        with self.assertRaisesRegex(RuntimeError, "handler failed"):
            bus.publish(
                ModelVersionPromoted(model_version_id="mv1", from_stage="staging", to_stage="production"),
                context=self._context(),
                session=object(),
            )

    def test_domain_event_module_stays_context_free(self) -> None:
        from app.domains.shared.events import domain_event

        source = domain_event.__doc__ or ""
        self.assertIn("no dependency on transport or request context", source)


if __name__ == "__main__":
    unittest.main()

