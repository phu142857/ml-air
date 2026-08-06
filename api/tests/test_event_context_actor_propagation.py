"""Phase 2 Epic 1 — Event Context & Actor Propagation."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app.domains.audit.audit_event_handler import AuditEventHandler
from app.domains.audit.audit_event_mapper import AuditEventMapper
from app.domains.governance.model_version_aggregate import ModelVersionPromoted
from app.domains.shared.events import (
    ActorRef,
    EventContext,
    EventEnvelope,
    InProcessEventBus,
    actor_ref_from_principal,
    bind_actor_from_principal,
    build_event_context,
    reset_event_request_context,
)
from app.domains.shared.events.request_context import bind_http_request_meta, get_bound_actor


class TestActorRefFromPrincipal(unittest.TestCase):
    def test_user_principal_uses_display_name(self) -> None:
        principal = SimpleNamespace(
            principal_kind="user",
            user_id="u-1",
            service_account_id=None,
            subject="u-1",
        )
        with patch(
            "app.domains.governance.identity_repository.identity_tables_available",
            return_value=True,
        ), patch(
            "app.domains.governance.identity_repository.get_user_by_id",
            return_value={"username": "nguyenvana", "display_name": "Nguyễn Văn A"},
        ):
            actor = actor_ref_from_principal(principal)
        self.assertEqual(actor.actor_type, "USER")
        self.assertEqual(actor.actor_id, "u-1")
        self.assertEqual(actor.actor_name, "Nguyễn Văn A")

    def test_service_account_principal(self) -> None:
        principal = SimpleNamespace(
            principal_kind="service_account",
            user_id=None,
            service_account_id="sa-9",
            subject="sa-9",
        )
        actor = actor_ref_from_principal(principal)
        self.assertEqual(actor.actor_type, "SERVICE_ACCOUNT")
        self.assertEqual(actor.actor_id, "sa-9")


class TestBuildEventContext(unittest.TestCase):
    def tearDown(self) -> None:
        reset_event_request_context()

    def test_background_defaults_to_system_actor(self) -> None:
        reset_event_request_context()
        ctx = build_event_context(tenant_id="t1", project_id="p1")
        assert ctx.actor is not None
        self.assertEqual(ctx.actor.actor_type, "SYSTEM")
        self.assertEqual(ctx.tenant_id, "t1")
        self.assertEqual(ctx.project_id, "p1")
        self.assertTrue(ctx.correlation_id)

    def test_bound_actor_and_http_meta_propagate(self) -> None:
        reset_event_request_context()
        request = SimpleNamespace(
            headers={
                "x-request-id": "req-42",
                "x-correlation-id": "corr-99",
                "user-agent": "pytest-agent",
                "x-forwarded-for": "203.0.113.10, 10.0.0.1",
            },
            client=SimpleNamespace(host="127.0.0.1"),
        )
        bind_http_request_meta(request)
        with patch(
            "app.domains.governance.identity_repository.identity_tables_available",
            return_value=False,
        ):
            bind_actor_from_principal(
                SimpleNamespace(
                    principal_kind="legacy",
                    user_id=None,
                    service_account_id=None,
                    subject="maintainer-token",
                )
            )
            ctx = build_event_context(tenant_id="t1", project_id="p1")

        assert ctx.actor is not None
        self.assertEqual(ctx.actor.actor_type, "USER")
        self.assertEqual(ctx.actor.actor_id, "maintainer-token")
        self.assertEqual(ctx.actor.actor_name, "maintainer-token")
        self.assertEqual(ctx.request_id, "req-42")
        self.assertEqual(ctx.correlation_id, "corr-99")
        self.assertEqual(ctx.ip, "203.0.113.10")
        self.assertEqual(ctx.user_agent, "pytest-agent")


class TestAuditMapperActorPropagation(unittest.TestCase):
    def test_mapper_writes_actor_and_request_id_metadata(self) -> None:
        ctx = EventContext(
            tenant_id="t1",
            project_id="p1",
            actor=ActorRef(actor_type="USER", actor_id="u-1", actor_name="Nguyễn Văn A"),
            correlation_id="corr-1",
            request_id="req-1",
            ip="1.2.3.4",
            user_agent="ua",
        )
        envelope = EventEnvelope(
            event_id="e1",
            event_version=1,
            occurred_at=datetime(2026, 8, 4, 9, 35, 22, tzinfo=timezone.utc),
            event=ModelVersionPromoted(
                model_id="m1",
                model_version_id="mv12",
                version=12,
                from_stage="staging",
                to_stage="production",
                approval_status="approved",
            ),
            context=ctx,
        )
        row = AuditEventMapper().map(envelope)
        self.assertEqual(row["actor_kind"], "user")
        self.assertEqual(row["actor_id"], "u-1")
        self.assertEqual(row["actor_name"], "Nguyễn Văn A")
        self.assertEqual(row["correlation_id"], "corr-1")
        self.assertEqual(row["ip"], "1.2.3.4")
        self.assertEqual(row["metadata"]["request_id"], "req-1")
        self.assertEqual(row["action"], "model_version.promoted")


class TestPublishUsesBoundContext(unittest.TestCase):
    def tearDown(self) -> None:
        reset_event_request_context()

    def test_handler_receives_bound_actor_via_build_event_context(self) -> None:
        reset_event_request_context()
        with patch(
            "app.domains.governance.identity_repository.identity_tables_available",
            return_value=True,
        ), patch(
            "app.domains.governance.identity_repository.get_user_by_id",
            return_value={"username": "alice", "display_name": "Alice"},
        ):
            bind_actor_from_principal(
                SimpleNamespace(
                    principal_kind="user",
                    user_id="u-42",
                    service_account_id=None,
                    subject="alice",
                )
            )
            ctx = build_event_context(tenant_id="t1", project_id="p1")

        inserted: list[dict] = []

        class _Repo:
            def insert_event(self, *, session, row):  # noqa: ANN001
                inserted.append(row)
                return row.get("id") or "x"

        bus = InProcessEventBus()
        handler = AuditEventHandler(repository=_Repo(), mapper=AuditEventMapper())
        bus.subscribe(ModelVersionPromoted, handler)
        bus.publish(
            ModelVersionPromoted(
                model_id="m1",
                model_version_id="mv12",
                version=12,
                from_stage="staging",
                to_stage="production",
                approval_status="approved",
            ),
            context=ctx,
            session=object(),
        )
        self.assertEqual(len(inserted), 1)
        self.assertEqual(inserted[0]["actor_name"], "Alice")
        self.assertEqual(inserted[0]["actor_id"], "u-42")
        self.assertEqual(inserted[0]["actor_kind"], "user")


class TestAuthenticateBearerBindsActor(unittest.TestCase):
    def tearDown(self) -> None:
        reset_event_request_context()

    def test_legacy_token_binds_actor(self) -> None:
        from app.domains.governance.auth_service import authenticate_bearer

        reset_event_request_context()
        with patch(
            "app.domains.governance.auth_service._legacy_static_tokens_enabled",
            return_value=True,
        ), patch(
            "app.domains.governance.identity_repository.identity_tables_available",
            return_value=False,
        ), patch(
            "app.domains.governance.auth_service._decode_jwt_token",
            return_value=None,
        ), patch(
            "app.domains.governance.auth_service._token_db",
            return_value={
                "maintainer-token": {
                    "role": "maintainer",
                    "tenant_id": "default",
                    "project_ids": ["default_project"],
                }
            },
        ):
            principal = authenticate_bearer("Bearer maintainer-token")
            self.assertEqual(principal.principal_kind, "legacy")
            actor = get_bound_actor()
            assert actor is not None
            self.assertEqual(actor.actor_type, "USER")
            self.assertEqual(actor.actor_id, principal.subject)


if __name__ == "__main__":
    unittest.main()
