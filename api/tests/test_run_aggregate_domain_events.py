"""Phase 2 Epic 2 — Run Aggregate Domain Events."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.domains.audit.audit_event_handler import AuditEventHandler
from app.domains.audit.audit_event_mapper import AuditEventMapper
from app.domains.orchestration.run_aggregate import (
    RunAggregate,
    RunCancelled,
    RunCompleted,
    RunCreated,
    RunFailed,
    RunStarted,
)
from app.domains.orchestration.run_domain_events import publish_run_lifecycle_events
from app.domains.shared.events import EventContext, InProcessEventBus, build_event_context, reset_event_request_context
from app.domains.orchestration.webhook_event_handler import WebhookEventHandler, WebhookEventMapper, WebhookEventSink


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


class TestRunAggregate(unittest.TestCase):
    def test_created_started_completed_order(self) -> None:
        agg = RunAggregate(run_id="r1", pipeline_id="p1", status="PENDING")
        agg.mark_created()
        agg.start(from_status="PENDING")
        agg.complete(from_status="RUNNING")
        events = agg.pull_events()
        self.assertEqual(
            [type(e).__name__ for e in events],
            ["RunCreated", "RunStarted", "RunCompleted"],
        )
        self.assertEqual(agg.pull_events(), [])

    def test_fail_and_cancel(self) -> None:
        agg = RunAggregate(run_id="r1", pipeline_id="p1", status="RUNNING")
        agg.fail(from_status="RUNNING", reason="boom")
        failed = agg.pull_events()
        self.assertIsInstance(failed[0], RunFailed)
        self.assertEqual(failed[0].reason, "boom")

        agg2 = RunAggregate(run_id="r2", pipeline_id="p1", status="RUNNING")
        agg2.cancel(from_status="RUNNING")
        self.assertIsInstance(agg2.pull_events()[0], RunCancelled)


class TestPublishRunLifecycleEvents(unittest.TestCase):
    def tearDown(self) -> None:
        reset_event_request_context()

    def test_publish_created_reaches_audit_and_webhook(self) -> None:
        reset_event_request_context()
        bus = InProcessEventBus()
        repo = _CaptureRepo()
        sink = _CaptureSink()
        bus.subscribe(RunCreated, AuditEventHandler(repository=repo, mapper=AuditEventMapper()))
        bus.subscribe(RunCreated, WebhookEventHandler(mapper=WebhookEventMapper(), sink=sink))

        with patch("app.domains.orchestration.run_domain_events.get_event_bus", return_value=bus), patch(
            "app.domains.orchestration.run_domain_events.build_event_context",
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
            publish_run_lifecycle_events(
                session=object(),
                tenant_id="t1",
                project_id="p1",
                run_id="r1",
                pipeline_id="pipe-1",
                status="PENDING",
                created=True,
            )

        self.assertEqual(len(repo.rows), 1)
        self.assertEqual(repo.rows[0]["action"], "run.created")
        self.assertEqual(repo.rows[0]["target_id"], "r1")
        self.assertEqual(len(sink.drafts), 1)
        self.assertEqual(sink.drafts[0].action, "run.created")

    def test_publish_status_transitions(self) -> None:
        reset_event_request_context()
        bus = InProcessEventBus()
        repo = _CaptureRepo()
        for et in (RunStarted, RunCompleted, RunFailed, RunCancelled):
            bus.subscribe(et, AuditEventHandler(repository=repo, mapper=AuditEventMapper()))

        with patch("app.domains.orchestration.run_domain_events.get_event_bus", return_value=bus), patch(
            "app.domains.orchestration.run_domain_events.build_event_context",
            side_effect=lambda **kwargs: build_event_context(**kwargs),
        ):
            for status, action in (
                ("RUNNING", "run.started"),
                ("SUCCESS", "run.completed"),
                ("FAILED", "run.failed"),
                ("CANCELLED", "run.cancelled"),
            ):
                repo.rows.clear()
                publish_run_lifecycle_events(
                    session=object(),
                    tenant_id="t1",
                    project_id="p1",
                    run_id="r1",
                    pipeline_id="pipe-1",
                    status=status,
                    from_status="PENDING" if status == "RUNNING" else "RUNNING",
                )
                self.assertEqual(repo.rows[0]["action"], action)


if __name__ == "__main__":
    unittest.main()
