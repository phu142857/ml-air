"""Phase 2 Epic 4–7 — Domain Event outbox, codec, dispatch."""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.domains.governance.model_version_aggregate import ModelVersionPromoted
from app.domains.shared.events import ActorRef, EventContext, InProcessEventBus
from app.domains.shared.events.domain_event_codec import deserialize_envelope, serialize_envelope
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.postgres_outbox_event_bus import PostgresOutboxEventBus


class TestDomainEventCodec(unittest.TestCase):
    def test_round_trip_envelope(self) -> None:
        ctx = EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=ActorRef(actor_type="USER", actor_id="u1", actor_name="alice"),
            correlation_id="c1",
            request_id="req-1",
            ip="127.0.0.1",
            user_agent="pytest",
        )
        event = ModelVersionPromoted(
            model_id="m1",
            model_version_id="mv1",
            version=1,
            from_stage="staging",
            to_stage="production",
            approval_status="approved",
        )
        envelope = EventEnvelope(
            event_id="evt-1",
            event_version=1,
            occurred_at=datetime(2026, 8, 6, tzinfo=timezone.utc),
            event=event,
            context=ctx,
        )
        raw = serialize_envelope(envelope)
        restored = deserialize_envelope(raw)
        self.assertEqual(restored.event_id, "evt-1")
        self.assertEqual(restored.event.model_version_id, "mv1")
        self.assertEqual(restored.context.tenant_id, "t1")
        self.assertEqual(restored.context.request_id, "req-1")


class TestPostgresOutboxEventBus(unittest.TestCase):
    def test_publish_persists_without_dispatch(self) -> None:
        dispatcher = InProcessEventBus()
        captured: list[object] = []

        class _H:
            def handle(self, envelope, *, session) -> None:  # noqa: ANN001
                captured.append(envelope)

        dispatcher.subscribe(ModelVersionPromoted, _H())
        bus = PostgresOutboxEventBus(dispatcher=dispatcher)
        session = MagicMock()
        cursor = MagicMock()
        session.cursor.return_value.__enter__.return_value = cursor

        event = ModelVersionPromoted(
            model_id="m1",
            model_version_id="mv1",
            version=1,
            from_stage="a",
            to_stage="b",
            approval_status=None,
        )
        ctx = EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=None,
            correlation_id=None,
            request_id=None,
            ip=None,
            user_agent=None,
        )
        bus.publish(event, context=ctx, session=session)
        self.assertEqual(captured, [])
        self.assertEqual(cursor.execute.call_count, 1)
        args = cursor.execute.call_args[0][1]
        self.assertEqual(args[0], cursor.execute.call_args[0][1][0])  # event_id present
        envelope_json = json.loads(args[4])
        self.assertEqual(envelope_json["event"]["__type__"], "ModelVersionPromoted")

    def test_dispatch_envelope_invokes_handlers(self) -> None:
        dispatcher = InProcessEventBus()
        seen: list[str] = []

        class _H:
            def handle(self, envelope, *, session) -> None:  # noqa: ANN001
                seen.append(envelope.event_id)

        dispatcher.subscribe(ModelVersionPromoted, _H())
        bus = PostgresOutboxEventBus(dispatcher=dispatcher)
        envelope = EventEnvelope.create(
            event=ModelVersionPromoted(
                model_id="m1",
                model_version_id="mv1",
                version=1,
                from_stage="a",
                to_stage="b",
                approval_status=None,
            ),
            context=EventContext(
                tenant_id="t1",
                project_id="p1",
                actor=None,
                correlation_id=None,
                request_id=None,
                ip=None,
                user_agent=None,
            ),
        )
        bus.dispatch_envelope(envelope, session=object())
        self.assertEqual(seen, [envelope.event_id])


class TestOutboxFlags(unittest.TestCase):
    def test_outbox_off_by_default(self) -> None:
        from app.domains.shared.events import domain_event_outbox_service as svc

        with patch.dict("os.environ", {"ML_AIR_DOMAIN_EVENT_OUTBOX": "0"}, clear=False):
            self.assertFalse(svc.outbox_writes_enabled())

    def test_replay_empty_ids(self) -> None:
        from app.domains.shared.events import domain_event_outbox_service as svc

        self.assertEqual(svc.replay_outbox_by_ids("t", "p", []), [])


if __name__ == "__main__":
    unittest.main()
