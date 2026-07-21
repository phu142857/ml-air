"""Tests for HTTP pipeline task contract."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sdk.http_task_contract import (
    execute_http_task,
    merge_context_into_body,
    task_is_http,
    validate_http_task_item,
    validate_pipeline_tasks,
)


class TestHttpTaskContract(unittest.TestCase):
    def test_task_is_http_by_type(self) -> None:
        self.assertTrue(task_is_http({"id": "h1", "type": "http", "http": {"url": "https://x.test/a"}}))

    def test_validate_requires_allowlisted_host(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_HTTP_TASK_ALLOWED_HOSTS": "hooks.example.com"}, clear=False):
            errs = validate_http_task_item(
                {
                    "id": "n1",
                    "type": "http",
                    "http": {"method": "POST", "url": "https://evil.test/hook", "json_body": {}},
                }
            )
        self.assertTrue(errs)

    def test_validate_ok_host(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_HTTP_TASK_ALLOWED_HOSTS": "hooks.example.com"}, clear=False):
            errs = validate_http_task_item(
                {
                    "id": "n1",
                    "type": "http",
                    "http": {"method": "POST", "url": "https://hooks.example.com/hook", "json_body": {"k": 1}},
                }
            )
        self.assertEqual(errs, [])

    def test_merge_context_into_body(self) -> None:
        out = merge_context_into_body({"event": "done"}, {"run_id": "r1", "task_id": "t1"})
        self.assertEqual(out["run_id"], "r1")
        self.assertEqual(out["event"], "done")

    def test_plugin_and_http_mutually_exclusive(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_HTTP_TASK_ALLOWED_HOSTS": "hooks.example.com"}, clear=False):
            errs = validate_pipeline_tasks(
                [{"id": "x", "plugin": "echo", "type": "http", "http": {"url": "https://hooks.example.com/x"}}]
            )
        self.assertTrue(any("both" in e for e in errs))

    @patch("urllib.request.urlopen")
    def test_execute_success(self, mock_urlopen) -> None:
        class Resp:
            status = 200

            def getcode(self) -> int:
                return 200

            def read(self, _amt: int = -1) -> bytes:
                return b'{"ok":true}'

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        mock_urlopen.return_value = Resp()
        with patch.dict(os.environ, {"ML_AIR_HTTP_TASK_ALLOWED_HOSTS": "hooks.example.com"}, clear=False):
            out = execute_http_task(
                {"method": "POST", "url": "https://hooks.example.com/h", "json_body": {}},
                context={"run_id": "r1"},
            )
        self.assertTrue(out["ok"])


if __name__ == "__main__":
    unittest.main()
