from __future__ import annotations

import unittest
from dataclasses import FrozenInstanceError
from datetime import datetime, timezone
from unittest.mock import patch


_psycopg_ok = True
_fastapi_ok = True

try:
    import psycopg  # noqa: F401
except Exception:
    _psycopg_ok = False

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:
    _fastapi_ok = False


class TestDomainAuditAPIIntegration(unittest.TestCase):
    @unittest.skipUnless(_psycopg_ok and _fastapi_ok, "integration deps missing")
    def test_list_audit_events_filters_and_dto_shape(self) -> None:
        from app.api.routes.audit_events_routes import router as audit_router
        from app.domains.shared.pagination import PageResult, encode_cursor
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(audit_router, prefix="/v1")
        client = TestClient(app)

        with patch("app.api.routes.audit_events_routes.authorize_scope") as _authorize_scope, patch(
            "app.api.routes.audit_events_routes.authenticate_bearer"
        ) as _auth_bearer, patch(
            "app.api.routes.audit_events_routes.repo.list_domain_audit_events_page"
        ) as mock_list:
            _auth_bearer.return_value = object()

            row = {
                "id": "e1",
                "occurred_at": datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
                "tenant_id": "t1",
                "project_id": "p1",
                "actor_kind": "user",
                "actor_id": "u1",
                "actor_name": "alice",
                "action": "model_version.created",
                "target_type": "model_version",
                "target_id": "mv1",
                "ip": "127.0.0.1",
                "user_agent": "pytest",
                "correlation_id": "corr-1",
                "metadata": {"version": 1},
            }
            next_cur = encode_cursor({"occurred_at": "2026-01-02T03:04:05+00:00", "id": "e1"})
            mock_list.return_value = PageResult(
                items=[row],
                next_cursor=next_cur,
                has_more=True,
                limit=10,
                offset=0,
            )

            resp = client.get(
                "/v1/audit/events",
                params={
                    "tenant": "t1",
                    "project": "p1",
                    "actor": "u1",
                    "action": "model_version.created",
                    "target_type": "model_version",
                    "target_id": "mv1",
                    "limit": 10,
                },
                headers={"Authorization": "Bearer whatever"},
            )
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertIn("items", body)
            self.assertEqual(len(body["items"]), 1)
            self.assertTrue(body["has_more"])
            self.assertEqual(body["next_cursor"], next_cur)

            ev = body["items"][0]
            self.assertEqual(ev["id"], "e1")
            self.assertEqual(ev["tenant"], "t1")
            self.assertEqual(ev["project"], "p1")
            self.assertEqual(ev["actor"]["actor_kind"], "user")
            self.assertEqual(ev["actor"]["actor_id"], "u1")
            self.assertEqual(ev["action"], "model_version.created")
            self.assertEqual(ev["target_type"], "model_version")
            self.assertEqual(ev["target_id"], "mv1")
            self.assertEqual(ev["metadata"], {"version": 1})
            self.assertNotIn("tenant_id", ev)
            self.assertNotIn("project_id", ev)

            args, kwargs = mock_list.call_args
            self.assertEqual(kwargs["tenant"], "t1")
            self.assertEqual(kwargs["project"], "p1")
            self.assertEqual(kwargs["actor"], "u1")
            self.assertEqual(kwargs["action"], "model_version.created")
            self.assertEqual(kwargs["target_type"], "model_version")
            self.assertEqual(kwargs["target_id"], "mv1")

    @unittest.skipUnless(_psycopg_ok and _fastapi_ok, "integration deps missing")
    def test_list_preserves_cursor_without_mutating_page(self) -> None:
        from app.api.routes.audit_events_routes import router as audit_router
        from app.domains.shared.pagination import PageResult, encode_cursor
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(audit_router, prefix="/v1")
        client = TestClient(app)

        next_cur = encode_cursor({"occurred_at": "2026-01-02T03:04:05+00:00", "id": "e0"})
        page = PageResult(
            items=[
                {
                    "id": "e0",
                    "occurred_at": datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
                    "tenant_id": "t1",
                    "project_id": "p1",
                    "actor_kind": "system",
                    "actor_id": None,
                    "actor_name": None,
                    "action": "dataset.created",
                    "target_type": "dataset",
                    "target_id": "d1",
                    "ip": None,
                    "user_agent": None,
                    "correlation_id": None,
                    "metadata": {"dataset_id": "d1", "name": "cats"},
                }
            ],
            next_cursor=next_cur,
            has_more=True,
            limit=1,
            offset=None,
        )
        original_items = page.items

        with patch("app.api.routes.audit_events_routes.authorize_scope"), patch(
            "app.api.routes.audit_events_routes.authenticate_bearer", return_value=object()
        ), patch(
            "app.api.routes.audit_events_routes.repo.list_domain_audit_events_page",
            return_value=page,
        ):
            resp = client.get(
                "/v1/audit/events",
                params={"tenant": "t1", "project": "p1", "limit": 1},
                headers={"Authorization": "Bearer whatever"},
            )
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertEqual(body["next_cursor"], next_cur)
            self.assertTrue(body["has_more"])
            # Original frozen page must be untouched (still raw DB-shaped items).
            self.assertIs(page.items, original_items)
            self.assertEqual(page.items[0]["tenant_id"], "t1")
            with self.assertRaises(FrozenInstanceError):
                page.items = []  # type: ignore[misc]

    @unittest.skipUnless(_psycopg_ok and _fastapi_ok, "integration deps missing")
    def test_get_audit_event_by_id_returns_dto(self) -> None:
        from app.api.routes.audit_events_routes import router as audit_router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(audit_router, prefix="/v1")
        client = TestClient(app)

        with patch("app.api.routes.audit_events_routes.authorize_scope") as _authorize_scope, patch(
            "app.api.routes.audit_events_routes.authenticate_bearer"
        ) as _auth_bearer, patch(
            "app.api.routes.audit_events_routes.repo.get_domain_audit_event"
        ) as mock_get:
            _auth_bearer.return_value = object()
            mock_get.return_value = {
                "id": "e1",
                "occurred_at": datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
                "tenant_id": "t1",
                "project_id": "p1",
                "actor_kind": "user",
                "actor_id": "u1",
                "actor_name": "alice",
                "action": "model_version.created",
                "target_type": "model_version",
                "target_id": "mv1",
                "ip": "127.0.0.1",
                "user_agent": "pytest",
                "correlation_id": "corr-1",
                "metadata": {"version": 1},
            }

            resp = client.get("/v1/audit/events/e1", headers={"Authorization": "Bearer whatever"})
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertEqual(body["id"], "e1")
            self.assertEqual(body["tenant"], "t1")
            self.assertEqual(body["project"], "p1")
            self.assertEqual(body["actor"]["actor_name"], "alice")
            self.assertEqual(body["metadata"], {"version": 1})


class TestPageResultImmutabilityRegression(unittest.TestCase):
    def test_page_result_rejects_item_mutation(self) -> None:
        from app.domains.shared.pagination import PageResult

        page = PageResult(items=[{"id": "1"}], next_cursor=None, has_more=False, limit=10)
        with self.assertRaises(FrozenInstanceError):
            page.items = [{"id": "2"}]  # type: ignore[misc]
        with self.assertRaises(FrozenInstanceError):
            page.has_more = True  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
