from __future__ import annotations

import unittest
from dataclasses import asdict

from app.domains.governance.model_version_aggregate import ModelVersionCreated
from app.domains.lifecycle.dataset_aggregate import DatasetCreated
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.orchestration.webhook_event_handler import WebhookEventHandler, WebhookEventMapper, WebhookEventSink
from app.domains.shared.events import ActorRef, EventContext, InProcessEventBus


class _CaptureSink(WebhookEventSink):
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    def record(self, draft, *, session, event_id=None):  # type: ignore[override]
        self.calls.append((draft, session))


class TestWebhookEventHandler(unittest.TestCase):
    def _ctx(self) -> EventContext:
        return EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=ActorRef(actor_type="USER", actor_id="u1", actor_name="alice"),
            correlation_id="corr-1",
            ip="127.0.0.1",
            user_agent="pytest",
        )

    def test_mapping_model_version_created(self) -> None:
        bus = InProcessEventBus()
        sink = _CaptureSink()
        handler = WebhookEventHandler(mapper=WebhookEventMapper(), sink=sink)
        bus.subscribe(ModelVersionCreated, handler)

        session = object()
        ev = ModelVersionCreated(model_id="m1", model_version_id="mv1", version=3, stage="staging")
        bus.publish(ev, context=self._ctx(), session=session)

        self.assertEqual(len(sink.calls), 1)
        draft, s = sink.calls[0]
        self.assertIs(s, session)
        self.assertEqual(draft.tenant_id, "t1")
        self.assertEqual(draft.project_id, "p1")
        self.assertEqual(draft.actor_kind, "user")
        self.assertEqual(draft.action, "model_version.created")
        self.assertEqual(draft.target_type, "model_version")
        self.assertEqual(draft.target_id, "mv1")
        self.assertEqual(draft.metadata, asdict(ev))

    def test_subscription_dataset_and_pipeline_events(self) -> None:
        bus = InProcessEventBus()
        sink = _CaptureSink()
        handler = WebhookEventHandler(mapper=WebhookEventMapper(), sink=sink)
        bus.subscribe(DatasetCreated, handler)
        bus.subscribe(PipelineVersionCreated, handler)

        session = object()
        ds = DatasetCreated(dataset_id="d1", name="cats")
        pv = PipelineVersionCreated(pipeline_id="pl1", pipeline_version_id="pv1", version=1)

        bus.publish(ds, context=self._ctx(), session=session)
        bus.publish(pv, context=self._ctx(), session=session)

        self.assertEqual(len(sink.calls), 2)
        actions = [c[0].action for c in sink.calls]
        self.assertIn("dataset.created", actions)
        self.assertIn("pipeline_version.created", actions)


if __name__ == "__main__":
    unittest.main()

