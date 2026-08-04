from __future__ import annotations

import json
import unittest
from typing import Any

from app.domains.audit.domain_audit_repository import DomainAuditRepository


class _FakeCursor:
    def __init__(self, log: dict[str, Any]) -> None:
        self._log = log

    def execute(self, query: str, params: tuple[Any, ...]) -> None:
        self._log["query"] = query
        self._log["params"] = params

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # type: ignore[no-untyped-def]
        return None


class _FakeSession:
    def __init__(self, log: dict[str, Any]) -> None:
        self._log = log

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self._log)


class TestDomainAuditRepository(unittest.TestCase):
    def test_insert_event_writes_expected_fields(self) -> None:
        log: dict[str, Any] = {}
        session = _FakeSession(log)

        repo = DomainAuditRepository()
        row = {
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
            "metadata": {"version": 1, "stage": "staging"},
        }

        event_id = repo.insert_event(session=session, row=row)

        params = log["params"]
        self.assertEqual(params[0], event_id)
        self.assertEqual(params[1], "t1")
        self.assertEqual(params[2], "p1")
        self.assertEqual(params[3], "user")
        self.assertEqual(params[4], "u1")
        self.assertEqual(params[5], "alice")
        self.assertEqual(params[6], "model_version.created")
        self.assertEqual(params[7], "model_version")
        self.assertEqual(params[8], "mv1")
        self.assertEqual(params[9], "127.0.0.1")
        self.assertEqual(params[10], "pytest")
        self.assertEqual(params[11], "corr-1")

        # metadata is stored as JSON string for the JSONB parameter.
        metadata_json = params[12]
        self.assertEqual(json.loads(metadata_json), row["metadata"])


if __name__ == "__main__":
    unittest.main()

