from __future__ import annotations

import unittest

from app.domains.observability.timeline_adapter import merge_timeline_items


class TestTimelineAdapterOrdering(unittest.TestCase):
    def test_merge_sorts_and_dedups_by_ts_kind_resource_id_desc(self) -> None:
        run_events = [
            {
                "ts": "2026-01-04T00:00:00+00:00",
                "kind": "run.created",
                "resource_id": "r2",
            },
            {
                "ts": "2026-01-04T00:00:00+00:00",
                "kind": "run.created",
                "resource_id": "r2",
            },  # duplicate
            {
                "ts": "2026-01-04T00:00:00+00:00",
                "kind": "run.created",
                "resource_id": "r3",
            },
        ]

        readiness_events = [
            {
                "ts": "2026-01-03T00:00:00+00:00",
                "kind": "dataset.readiness.evaluated",
                "resource_id": "d1",
            }
        ]

        domain_audit_events = [
            {
                "ts": "2026-01-04T00:00:00+00:00",
                "kind": "model.version.created",
                "resource_id": "m1",
            }
        ]

        merged = merge_timeline_items(run_events, readiness_events, domain_audit_events)
        simplified = [(it["ts"], it["kind"], it["resource_id"]) for it in merged]

        expected = [
            ("2026-01-04T00:00:00+00:00", "run.created", "r3"),
            ("2026-01-04T00:00:00+00:00", "run.created", "r2"),
            ("2026-01-04T00:00:00+00:00", "model.version.created", "m1"),
            ("2026-01-03T00:00:00+00:00", "dataset.readiness.evaluated", "d1"),
        ]
        self.assertEqual(simplified, expected)


if __name__ == "__main__":
    unittest.main()

