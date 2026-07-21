"""Tests for HTTP task Jinja + JSONPath templating."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sdk.http_task_templating import (
    render_http_config,
    render_template_string,
    resolve_jsonpath,
    validate_jsonpath_expr,
)


class TestHttpTaskTemplating(unittest.TestCase):
    def test_jinja_url(self) -> None:
        ctx = {"run_id": "run-abc", "task_id": "t1", "params": {}}
        out = render_template_string("https://hooks.example.com/runs/{{ run_id }}", ctx)
        self.assertEqual(out, "https://hooks.example.com/runs/run-abc")

    def test_jsonpath_params(self) -> None:
        root = {"params": {"k": 42}, "metrics": [{"v": 1}]}
        self.assertEqual(resolve_jsonpath(root, "$.params"), {"k": 42})
        self.assertEqual(resolve_jsonpath(root, "$.params.k"), 42)
        self.assertEqual(resolve_jsonpath(root, "$.metrics[0].v"), 1)

    def test_jsonpath_validate(self) -> None:
        self.assertTrue(validate_jsonpath_expr("$.params"))
        self.assertFalse(validate_jsonpath_expr("$..params"))

    def test_render_http_config_merge(self) -> None:
        cfg = {
            "method": "POST",
            "url": "https://hooks.example.com/{{ run_id }}",
            "json_body_jsonpath": "$.params",
            "json_body": {"event": "done", "trace": "{{ trace_id }}"},
            "headers": {"X-Run": "{{ run_id }}"},
            "timeout_seconds": 10,
        }
        context = {
            "run_id": "r99",
            "trace_id": "tr-1",
            "params": {"score": 0.9},
        }
        out = render_http_config(cfg, context=context)
        self.assertIn("r99", out["url"])
        self.assertEqual(out["json_body"]["score"], 0.9)
        self.assertEqual(out["json_body"]["event"], "done")
        self.assertEqual(out["json_body"]["trace"], "tr-1")
        self.assertEqual(out["headers"]["X-Run"], "r99")


if __name__ == "__main__":
    unittest.main()
