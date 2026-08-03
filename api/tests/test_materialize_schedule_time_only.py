"""snapshot_on_schedule materializes below threshold with force_time_only."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.domains.lifecycle import lineage_service


class TestScheduleTimeOnlyMaterialize(unittest.TestCase):
    def test_force_time_only_when_below_threshold(self) -> None:
        with (
            patch.object(lineage_service, "db_conn") as db_conn,
            patch.object(
                lineage_service,
                "get_dataset",
                return_value={"source_uri": "s3://b/x", "checksum": "abc"},
            ),
            patch.object(
                lineage_service,
                "_materialize_runtime_feedback_if_needed",
                return_value=("dv1", 7),
            ) as mat,
            patch.object(lineage_service, "MATERIALIZATION_SCHEDULE_TIME_ONLY_TOTAL") as metric,
        ):
            conn = MagicMock()
            cur = MagicMock()
            # dataset_id, source_type, current_size, target_threshold
            cur.fetchall.return_value = [("ds1", "runtime_feedback", 50, 1000)]
            conn.cursor.return_value.__enter__.return_value = cur
            db_conn.return_value.__enter__.return_value = conn

            out = lineage_service.materialize_scheduled_buffers(
                tenant_id="t1", project_id="p1", limit=10
            )

        self.assertEqual(out["materialized_count"], 1)
        self.assertTrue(out["materialized"][0]["force_time_only"])
        mat.assert_called_once()
        self.assertTrue(mat.call_args.kwargs.get("force") is True)
        metric.labels.assert_called_with(source_type="runtime_feedback")


if __name__ == "__main__":
    unittest.main()
