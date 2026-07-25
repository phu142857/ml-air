import unittest

from app.domains.observability.trace_timeline import apply_timeline_offsets, earliest_ts, parse_ts, wall_duration_ms


class TestTraceTimeline(unittest.TestCase):
    def test_parse_naive_ts_as_utc(self) -> None:
        dt = parse_ts("2026-07-25T05:22:55.323802")
        self.assertIsNotNone(dt)
        assert dt is not None
        self.assertEqual(dt.utcoffset().total_seconds(), 0)

    def test_wall_duration_prefers_timestamps(self) -> None:
        start = parse_ts("2026-07-25T05:22:56.398344+00:00")
        end = parse_ts("2026-07-25T05:22:57.414820+00:00")
        self.assertEqual(wall_duration_ms(start, end), 1016)

    def test_apply_offsets_uses_wall_clock_width(self) -> None:
        steps = [
            {
                "label": "train",
                "start_ts": "2026-07-25T05:29:12.479276+00:00",
                "end_ts": "2026-07-25T06:59:40.132584+00:00",
                "duration_ms": 999,
                "is_instant": False,
            }
        ]
        anchor_iso, total_ms = apply_timeline_offsets(steps)
        self.assertIsNotNone(anchor_iso)
        self.assertGreater(total_ms, 5_000_000)
        self.assertGreater(steps[0]["width_ms"], 5_000_000)

    def test_earliest_ts_uses_datetime_not_lexicographic_strings(self) -> None:
        early = earliest_ts("2026-07-25T09:00:00+00:00", "2026-07-25T10:00:00+00:00")
        self.assertEqual(early, parse_ts("2026-07-25T09:00:00+00:00"))


if __name__ == "__main__":
    unittest.main()
