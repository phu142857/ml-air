"""Phase 3 projection framework tests."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.domains.orchestration.run_aggregate import RunCreated
from app.domains.projections.framework.registry import ProjectionRegistry
from app.domains.projections.framework.runner import ProjectionRunner
from app.domains.projections.mappers.activity_event_mapper import map_envelope_to_activity
from app.domains.projections.mappers.timeline_event_mapper import map_envelope_to_timeline_item
from app.domains.projections.projectors.timeline_projection import TimelineProjection
from app.domains.shared.events import ActorRef, EventContext, EventEnvelope


class TestProjectionRegistry(unittest.TestCase):
    def test_register_and_lookup(self) -> None:
        reg = ProjectionRegistry()
        handler = TimelineProjection()
        reg.register(RunCreated, handler)
        event = RunCreated(run_id="r1", pipeline_id="p1", status="PENDING")
        found = reg.handlers_for(event)
        self.assertEqual(len(found), 1)
        self.assertIs(found[0], handler)


class TestProjectionRunner(unittest.TestCase):
    def test_runner_invokes_handler_with_ack(self) -> None:
        reg = ProjectionRegistry()
        handler = MagicMock()
        handler.projection_name = "timeline"
        reg.register(RunCreated, handler)
        runner = ProjectionRunner(registry=reg)
        ctx = EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=ActorRef(actor_type="USER", actor_id="u1", actor_name="John"),
            correlation_id="c1",
            ip=None,
            user_agent=None,
        )
        event = RunCreated(run_id="r1", pipeline_id="p1", status="PENDING")
        envelope = EventEnvelope(
            event_id="ev-1",
            event_version=1,
            occurred_at=datetime.now(timezone.utc),
            event=event,
            context=ctx,
        )
        session = MagicMock()
        with patch("app.domains.projections.framework.runner.try_claim_handler_ack", return_value=True):
            runner.run(envelope, session=session)
        handler.project.assert_called_once_with(envelope, session=session)


class TestTimelineMapper(unittest.TestCase):
    def test_run_created_maps_to_timeline_row(self) -> None:
        ctx = EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=None,
            correlation_id=None,
            ip=None,
            user_agent=None,
        )
        event = RunCreated(run_id="r1", pipeline_id="pipe-1", status="PENDING")
        envelope = EventEnvelope(
            event_id="ev-1",
            event_version=1,
            occurred_at=datetime.now(timezone.utc),
            event=event,
            context=ctx,
        )
        row = map_envelope_to_timeline_item(envelope)
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["kind"], "run.created")
        self.assertEqual(row["resource_type"], "run")
        self.assertEqual(row["resource_id"], "r1")


class TestActivityMapper(unittest.TestCase):
    def test_run_created_maps_to_activity(self) -> None:
        ctx = EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=ActorRef(actor_type="USER", actor_id="u1", actor_name="John"),
            correlation_id=None,
            ip=None,
            user_agent=None,
        )
        event = RunCreated(run_id="r1", pipeline_id="pipe-1", status="PENDING")
        envelope = EventEnvelope(
            event_id="ev-1",
            event_version=1,
            occurred_at=datetime.now(timezone.utc),
            event=event,
            context=ctx,
        )
        row = map_envelope_to_activity(envelope)
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["scope_type"], "run")
        self.assertIn("John", row["title"])
