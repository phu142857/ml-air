from __future__ import annotations

import unittest
from dataclasses import dataclass
from typing import Any
from unittest.mock import patch

from app.domains.governance.model_version_aggregate import (
    ModelVersionApproved,
    ModelVersionPromoted,
    ModelVersionRejected,
    ModelVersionRollback,
)
from app.domains.orchestration.metrics_event_handler import MetricsEventHandler, MetricsRecorder
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


class TestMetricsExactlyOnce(unittest.TestCase):
    def _ctx(self) -> EventContext:
        return EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=None,
            correlation_id=None,
            ip=None,
            user_agent=None,
        )

    def test_promote_transition_records_exactly_one_metric_with_legacy_emit(self) -> None:
        bus = InProcessEventBus()
        recorder = _CaptureRecorder()
        handler = MetricsEventHandler(recorder=recorder)
        bus.subscribe(ModelVersionPromoted, handler)

        with patch(
            "app.domains.lifecycle.realtime_events.record_lifecycle_model_promoted"
        ) as legacy_record, patch(
            "app.domains.lifecycle.realtime_events.publish_mlair_event"
        ):
            # Domain Event path (sole owner).
            bus.publish(
                ModelVersionPromoted(
                    model_id="m1",
                    model_version_id="mv1",
                    version=1,
                    from_stage="staging",
                    to_stage="production",
                    approval_status="approved",
                ),
                context=self._ctx(),
                session=object(),
            )
            # Legacy semantic path must not also increment lifecycle metrics.
            from app.domains.lifecycle.realtime_events import emit_model_promoted

            emit_model_promoted(
                tenant_id="t1",
                project_id="p1",
                model_id="m1",
                version=1,
                stage="production",
                updated_at=None,
            )

            self.assertEqual(len(recorder.calls), 1)
            self.assertEqual(recorder.calls[0].name, "model_promoted")
            self.assertEqual(recorder.calls[0].kwargs["stage"], "production")
            legacy_record.assert_not_called()

    def test_approval_transition_records_exactly_one_metric_with_legacy_notify(self) -> None:
        bus = InProcessEventBus()
        recorder = _CaptureRecorder()
        handler = MetricsEventHandler(recorder=recorder)
        bus.subscribe(ModelVersionApproved, handler)
        bus.subscribe(ModelVersionRejected, handler)

        with patch(
            "app.domains.lifecycle.realtime_events.record_lifecycle_model_version_approval_set"
        ) as legacy_record, patch(
            "app.domains.lifecycle.realtime_events.publish_mlair_event"
        ), patch(
            "app.domains.governance.model_registry_service._model_scope_for_id",
            return_value=("t1", "p1", "model-a"),
        ), patch(
            "app.domains.governance.model_registry_service.get_trace_id",
            return_value=None,
        ):
            bus.publish(
                ModelVersionApproved(
                    model_id="m1",
                    model_version_id="mv1",
                    version=1,
                    reason="ok",
                ),
                context=self._ctx(),
                session=object(),
            )
            from app.domains.governance.model_registry_service import _notify_model_eligibility_updated

            _notify_model_eligibility_updated(
                "m1",
                "approval_updated",
                approval_status="approved",
            )

            self.assertEqual(len(recorder.calls), 1)
            self.assertEqual(recorder.calls[0].kwargs["approval_status"], "approved")
            legacy_record.assert_not_called()

    def test_rollback_records_once_via_handler_only(self) -> None:
        bus = InProcessEventBus()
        recorder = _CaptureRecorder()
        handler = MetricsEventHandler(recorder=recorder)
        bus.subscribe(ModelVersionRollback, handler)

        bus.publish(
            ModelVersionRollback(
                model_id="m1",
                model_version_id="mv1",
                version=1,
                from_stage="production",
                to_stage="staging",
                approval_status="approved",
            ),
            context=self._ctx(),
            session=object(),
        )
        self.assertEqual(len(recorder.calls), 1)
        self.assertEqual(recorder.calls[0].kwargs["stage"], "staging")

    def test_services_do_not_call_lifecycle_metric_recorders(self) -> None:
        from pathlib import Path

        root = Path(__file__).resolve().parents[1] / "app"
        offenders: list[str] = []
        allowed = {
            "domains/orchestration/metrics_event_handler.py",
            "domains/lifecycle/realtime_events.py",  # defines record_* helpers
        }
        for path in root.rglob("*.py"):
            rel = str(path.relative_to(root))
            if rel in allowed:
                continue
            text = path.read_text()
            if "record_lifecycle_model_promoted(" in text or "record_lifecycle_model_version_approval_set(" in text:
                offenders.append(rel)
        self.assertEqual(offenders, [], f"legacy metric ownership remains in: {offenders}")

    def test_subscribe_metrics_wires_handler(self) -> None:
        bus = InProcessEventBus()
        with patch(
            "app.domains.orchestration.metrics_event_subscriber.get_event_bus",
            return_value=bus,
        ), patch(
            "app.domains.orchestration.metrics_event_subscriber.PrometheusMetricsRecorder"
        ) as rec_cls:
            from app.domains.orchestration.metrics_event_subscriber import start_metrics_event_subscriptions

            recorder = _CaptureRecorder()
            rec_cls.return_value = recorder
            start_metrics_event_subscriptions()
            bus.publish(
                ModelVersionPromoted(
                    model_id="m1",
                    model_version_id="mv1",
                    version=1,
                    from_stage="a",
                    to_stage="b",
                    approval_status=None,
                ),
                context=self._ctx(),
                session=object(),
            )
            self.assertEqual(len(recorder.calls), 1)


if __name__ == "__main__":
    unittest.main()
