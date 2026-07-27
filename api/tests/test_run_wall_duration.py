import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.domains.orchestration.tracking_service import _run_duration_seconds


class RunWallDurationTests(unittest.TestCase):
    @patch("app.domains.orchestration.task_service.list_tasks_by_run")
    def test_uses_max_task_finished_at_for_terminal_run(self, mock_list_tasks) -> None:
        mock_list_tasks.return_value = [
            {
                "finished_at": datetime(2026, 1, 1, 0, 8, tzinfo=timezone.utc),
                "status": "SUCCESS",
            },
            {
                "finished_at": datetime(2026, 1, 1, 0, 10, tzinfo=timezone.utc),
                "status": "SUCCESS",
            },
        ]
        seconds = _run_duration_seconds(
            {
                "run_id": "run-1",
                "status": "SUCCESS",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:03:00+00:00",
            }
        )
        self.assertEqual(seconds, 600.0)

    @patch("app.domains.orchestration.task_service.list_tasks_by_run")
    def test_active_run_uses_now(self, mock_list_tasks) -> None:
        mock_list_tasks.return_value = []
        fixed_now = datetime(2026, 1, 1, 0, 2, 0, tzinfo=timezone.utc)
        with patch(
            "app.domains.orchestration.tracking_service.datetime.now",
            return_value=fixed_now,
        ):
            seconds = _run_duration_seconds(
                {
                    "run_id": "run-1",
                    "status": "RUNNING",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:30+00:00",
                }
            )
        self.assertEqual(seconds, 120.0)

    def test_falls_back_to_updated_at_without_tasks(self) -> None:
        seconds = _run_duration_seconds(
            {
                "status": "SUCCESS",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:02:30+00:00",
            }
        )
        self.assertEqual(seconds, 150.0)


if __name__ == "__main__":
    unittest.main()
