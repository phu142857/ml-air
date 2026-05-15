"""URL-derived OpenTelemetry span attributes (path + query)."""

from __future__ import annotations

import unittest

from app import otel_api


class TestOtelRequestAttrs(unittest.TestCase):
    def test_tenant_project_and_dataset(self) -> None:
        p = "/v1/tenants/acme/projects/p1/datasets/ds-a/readiness"
        a = otel_api.mlair_http_span_attrs_from_url(p, "")
        self.assertEqual(a.get("mlair.tenant_id"), "acme")
        self.assertEqual(a.get("mlair.project_id"), "p1")
        self.assertEqual(a.get("mlair.dataset_id"), "ds-a")

    def test_model_run_pipeline_task(self) -> None:
        a = otel_api.mlair_http_span_attrs_from_url(
            "/v1/tenants/t/projects/p/models/m1/versions", ""
        )
        self.assertEqual(a.get("mlair.model_id"), "m1")
        a2 = otel_api.mlair_http_span_attrs_from_url("/v1/tenants/t/projects/p/runs/r99", "")
        self.assertEqual(a2.get("mlair.run_id"), "r99")
        a3 = otel_api.mlair_http_span_attrs_from_url("/v1/tenants/t/projects/p/pipelines/demo", "")
        self.assertEqual(a3.get("mlair.pipeline_id"), "demo")
        a4 = otel_api.mlair_http_span_attrs_from_url("/v1/tenants/t/projects/p/tasks/r1:1", "")
        self.assertEqual(a4.get("mlair.task_id"), "r1:1")

    def test_dataset_version_path_and_pipeline_version_path(self) -> None:
        a = otel_api.mlair_http_span_attrs_from_url(
            "/v1/tenants/t/projects/p/dataset-versions/v-123/metadata", ""
        )
        self.assertEqual(a.get("mlair.dataset_version_id"), "v-123")
        b = otel_api.mlair_http_span_attrs_from_url(
            "/v1/tenants/t/projects/p/pipelines/pl/versions/pv-9", ""
        )
        self.assertEqual(b.get("mlair.pipeline_id"), "pl")
        self.assertEqual(b.get("mlair.pipeline_version_id"), "pv-9")

    def test_query_supplements_when_path_missing(self) -> None:
        q = "dataset_version_id=dv-q&policy_id=pol-1&readiness_status=eligible"
        a = otel_api.mlair_http_span_attrs_from_url("/v1/tenants/t/projects/p/audit/timeline", q)
        self.assertEqual(a.get("mlair.dataset_version_id"), "dv-q")
        self.assertEqual(a.get("mlair.policy_id"), "pol-1")
        self.assertEqual(a.get("mlair.readiness_status"), "eligible")

    def test_path_wins_over_query_for_dataset_version_id(self) -> None:
        q = "dataset_version_id=from-query"
        a = otel_api.mlair_http_span_attrs_from_url(
            "/v1/tenants/t/projects/p/dataset-versions/from-path", q
        )
        self.assertEqual(a.get("mlair.dataset_version_id"), "from-path")
