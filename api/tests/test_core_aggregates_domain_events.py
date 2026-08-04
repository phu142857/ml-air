from __future__ import annotations

import unittest

from app.domains.governance.model_version_aggregate import (
    ModelVersionAggregate,
    ModelVersionApproved,
    ModelVersionCreated,
    ModelVersionPromoted,
)
from app.domains.lifecycle.dataset_aggregate import DatasetAggregate, DatasetCreated, DatasetDeleted
from app.domains.orchestration.pipeline_aggregate import (
    PipelineAggregate,
    PipelineVersionCreated,
)


class TestModelVersionAggregateDomainEvents(unittest.TestCase):
    def test_mark_created_emits_event_and_pull_events_clears(self) -> None:
        agg = ModelVersionAggregate(
            model_id="m1",
            model_version_id="mv1",
            version=1,
            stage="staging",
            approval_status="pending_manual_approval",
        )
        agg.mark_created()

        events = agg.pull_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], ModelVersionCreated)
        self.assertEqual(events[0].model_id, "m1")
        self.assertEqual(events[0].model_version_id, "mv1")
        self.assertEqual(events[0].version, 1)
        self.assertEqual(events[0].stage, "staging")

        self.assertEqual(agg.pull_events(), [])

    def test_approve_then_promote_emits_events_in_order(self) -> None:
        agg = ModelVersionAggregate(
            model_id="m1",
            model_version_id="mv1",
            version=2,
            stage="staging",
            approval_status="pending_manual_approval",
        )
        agg.approve(reason="approved-by-gov")
        agg.promote(to_stage="production")

        events = agg.pull_events()
        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0], ModelVersionApproved)
        self.assertEqual(events[0].reason, "approved-by-gov")
        self.assertIsInstance(events[1], ModelVersionPromoted)
        self.assertEqual(events[1].from_stage, "staging")
        self.assertEqual(events[1].to_stage, "production")


class TestDatasetAggregateDomainEvents(unittest.TestCase):
    def test_dataset_created_and_deleted(self) -> None:
        agg = DatasetAggregate(dataset_id="d1", name="cats")
        agg.mark_created()
        agg.mark_deleted()

        events = agg.pull_events()
        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0], DatasetCreated)
        self.assertEqual(events[0].dataset_id, "d1")
        self.assertIsInstance(events[1], DatasetDeleted)
        self.assertEqual(events[1].dataset_id, "d1")


class TestPipelineAggregateDomainEvents(unittest.TestCase):
    def test_pipeline_version_created_emits_event(self) -> None:
        agg = PipelineAggregate(pipeline_id="p1")
        agg.mark_pipeline_version_created(pipeline_version_id="pv1", version=3)

        events = agg.pull_events()
        self.assertEqual(len(events), 1)
        self.assertIsInstance(events[0], PipelineVersionCreated)
        self.assertEqual(events[0].pipeline_id, "p1")
        self.assertEqual(events[0].pipeline_version_id, "pv1")
        self.assertEqual(events[0].version, 3)


if __name__ == "__main__":
    unittest.main()

