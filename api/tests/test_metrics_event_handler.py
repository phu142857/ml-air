from __future__ import annotations

import unittest
from dataclasses import dataclass
from typing import Any

from app.domains.governance.model_version_aggregate import (
    ModelVersionApproved,
    ModelVersionPromoted,
    ModelVersionRejected,
    ModelVersionRollback,
)
from app.domains.lifecycle.dataset_aggregate import DatasetCreated
from app.domains.orchestration.metrics_event_handler import MetricsEventHandler, MetricsRecorder
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.shared.events import EventContext, InProcessEventBus


@dataclass
class _Call:
    name: str
    kwargs: dict[str, Any]


class _CaptureRecorder(MetricsRecorder):
    def __init__(self) -> None:
        self.calls: list[_Call] = []

    def record_model_promoted(self, *, stage: str) -> None:
        self.calls.append(_Call(name="model_promoted", kwargs={"stage": stage}))

    def record_model_version_approval_set(self, *, approval_status: str) -> None:
        self.calls.append(_Call(name="approval_set", kwargs={"approval_status": approval_status}))


class TestMetricsEventHandler(unittest.TestCase):
    def _ctx(self) -> EventContext:
        return EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=None,
            correlation_id=None,
            ip=None,
            user_agent=None,
        )

    def test_increments_for_model_promote_and_approval_only(self) -> None:
        bus = InProcessEventBus()
        recorder = _CaptureRecorder()
        handler = MetricsEventHandler(recorder=recorder)

        # Subscribe to a broad set; only some will record metrics.
        from app.domains.governance.model_version_aggregate import (
            ModelVersionApproved as MVApproved,
            ModelVersionRejected as MVRejected,
            ModelVersionPromoted as MVPromoted,
            ModelVersionRollback as MVRollback,
        )
        from app.domains.lifecycle.dataset_aggregate import DatasetCreated as DSCreated
        from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated as PVCreated

        bus.subscribe(MVPromoted, handler)
        bus.subscribe(MVRollback, handler)
        bus.subscribe(MVApproved, handler)
        bus.subscribe(MVRejected, handler)
        bus.subscribe(DSCreated, handler)
        bus.subscribe(PVCreated, handler)

        session = object()
        bus.publish(
            MVPromoted(
                model_id="m1",
                model_version_id="mv1",
                version=1,
                from_stage="staging",
                to_stage="production",
                approval_status="approved",
            ),
            context=self._ctx(),
            session=session,
        )
        bus.publish(
            MVRollback(
                model_id="m1",
                model_version_id="mv1",
                version=1,
                from_stage="production",
                to_stage="staging",
                approval_status="approved",
            ),
            context=self._ctx(),
            session=session,
        )
        bus.publish(
            MVApproved(model_id="m1", model_version_id="mv1", version=1, reason="ok"),
            context=self._ctx(),
            session=session,
        )
        bus.publish(
            MVRejected(model_id="m1", model_version_id="mv1", version=1, reason="nope"),
            context=self._ctx(),
            session=session,
        )
        bus.publish(
            DSCreated(dataset_id="d1", name="cats"),
            context=self._ctx(),
            session=session,
        )
        bus.publish(
            PVCreated(pipeline_id="pl1", pipeline_version_id="pv1", version=1),
            context=self._ctx(),
            session=session,
        )

        # Promoted + Rollback => 2 model_promoted recordings.
        # Approved + Rejected => 2 approval_set recordings.
        self.assertEqual(len(recorder.calls), 4)

        names = [c.name for c in recorder.calls]
        self.assertEqual(names.count("model_promoted"), 2)
        self.assertEqual(names.count("approval_set"), 2)

        stages = [c.kwargs["stage"] for c in recorder.calls if c.name == "model_promoted"]
        self.assertIn("production", stages)
        self.assertIn("staging", stages)

        statuses = [c.kwargs["approval_status"] for c in recorder.calls if c.name == "approval_set"]
        self.assertIn("approved", statuses)
        self.assertIn("rejected", statuses)


if __name__ == "__main__":
    unittest.main()

