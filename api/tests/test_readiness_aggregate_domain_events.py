"""Phase 2 Epic 3 — Readiness Aggregate Domain Events."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.audit.audit_event_handler import AuditEventHandler
from app.domains.audit.audit_event_mapper import AuditEventMapper
from app.domains.lifecycle.readiness_aggregate import ReadinessAggregate, ReadinessEvaluated
from app.domains.lifecycle.readiness_domain_events import publish_readiness_evaluated
from app.domains.orchestration.webhook_event_handler import WebhookEventHandler, WebhookEventMapper, WebhookEventSink
from app.domains.shared.events import EventContext, InProcessEventBus, reset_event_request_context


class _CaptureRepo:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def insert_event(self, *, session, row):  # noqa: ANN001
        self.rows.append(row)
        return "audit-1"


class _CaptureSink(WebhookEventSink):
    def __init__(self) -> None:
        self.drafts: list[object] = []

    def record(self, draft, *, session, event_id=None):  # type: ignore[override]
        self.drafts.append(draft)


class TestReadinessAggregate(unittest.TestCase):
    def test_mark_evaluated_emits_once(self) -> None:
        agg = ReadinessAggregate(dataset_id="d1")
        agg.mark_evaluated(
            evaluation_id="e1",
            dataset_version_id="dv1",
            policy_id="pol1",
            status="ready",
            source="manual",
            required_size=100,
            current_size=120,
            reasons=[{"code": "ok"}],
        )
        events = agg.pull_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], ReadinessEvaluated)
        self.assertEqual(events[0].evaluation_id, "e1")
        self.assertEqual(events[0].dataset_id, "d1")
        self.assertEqual(events[0].status, "ready")
        self.assertEqual(events[0].reasons, ({"code": "ok"},))
        self.assertEqual(agg.pull_events(), [])


class TestPublishReadinessEvaluated(unittest.TestCase):
    def tearDown(self) -> None:
        reset_event_request_context()

    def test_publish_reaches_audit_and_webhook(self) -> None:
        reset_event_request_context()
        bus = InProcessEventBus()
        repo = _CaptureRepo()
        sink = _CaptureSink()
        bus.subscribe(ReadinessEvaluated, AuditEventHandler(repository=repo, mapper=AuditEventMapper()))
        bus.subscribe(ReadinessEvaluated, WebhookEventHandler(mapper=WebhookEventMapper(), sink=sink))

        with patch("app.domains.lifecycle.readiness_domain_events.get_event_bus", return_value=bus), patch(
            "app.domains.lifecycle.readiness_domain_events.build_event_context",
            return_value=EventContext(
                tenant_id="t1",
                project_id="p1",
                actor=None,
                correlation_id="c1",
                request_id="req-1",
                ip=None,
                user_agent=None,
            ),
        ):
            publish_readiness_evaluated(
                session=object(),
                tenant_id="t1",
                project_id="p1",
                evaluation_id="e1",
                dataset_id="d1",
                dataset_version_id="dv1",
                policy_id="pol1",
                status="blocked",
                source="queue",
                required_size=50,
                current_size=10,
                reasons=[{"code": "insufficient_size"}],
            )

        self.assertEqual(len(repo.rows), 1)
        self.assertEqual(repo.rows[0]["action"], "dataset.readiness.evaluated")
        self.assertEqual(repo.rows[0]["target_type"], "dataset")
        self.assertEqual(repo.rows[0]["target_id"], "d1")
        self.assertEqual(repo.rows[0]["metadata"]["evaluation_id"], "e1")
        self.assertEqual(repo.rows[0]["metadata"]["request_id"], "req-1")
        self.assertEqual(len(sink.drafts), 1)
        self.assertEqual(sink.drafts[0].action, "dataset.readiness.evaluated")
        self.assertEqual(sink.drafts[0].target_id, "d1")


if __name__ == "__main__":
    unittest.main()
