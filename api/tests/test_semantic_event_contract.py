"""Contract tests for MLAir semantic event envelope v1."""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from jsonschema import ValidationError

from app.domains.lifecycle.realtime_events import EventType, build_event
from app.domains.lifecycle.semantic_event_contract import (
    strict_validation_enabled,
    validate_semantic_event,
    validate_semantic_event_if_enabled,
)

_SCHEMA = Path(__file__).resolve().parents[1] / "app" / "schemas" / "mlair-semantic-event-v1.schema.json"


class TestSemanticEventContract(unittest.TestCase):
    def test_schema_file_present_in_api(self) -> None:
        self.assertTrue(_SCHEMA.is_file())

    def test_build_event_passes_schema(self) -> None:
        ev = build_event(
            event_type=EventType.TRAINING_TRIGGERED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-1",
            payload={"run_id": "run-1", "model_id": "m1"},
            trace_id="abc",
        )
        validate_semantic_event(ev)

    def test_missing_type_fails(self) -> None:
        ev = build_event(
            event_type=EventType.RUN_CREATED,
            tenant_id="t",
            project_id="p",
            resource_id="r",
            payload={},
        )
        del ev["type"]
        with self.assertRaises(ValidationError):
            validate_semantic_event(ev)

    def test_unknown_type_fails(self) -> None:
        ev = build_event(
            event_type=EventType.RUN_CREATED,
            tenant_id="t",
            project_id="p",
            resource_id="r",
            payload={},
        )
        ev["type"] = "not.a.real.event"
        with self.assertRaises(ValidationError):
            validate_semantic_event(ev)

    def test_strict_publish_skips_invalid_when_enabled(self) -> None:
        ev = build_event(
            event_type=EventType.RUN_CREATED,
            tenant_id="t",
            project_id="p",
            resource_id="r",
            payload={},
        )
        ev["type"] = "invalid.type"
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_EVENT_VALIDATE": "1"}, clear=False):
            self.assertTrue(strict_validation_enabled())
            self.assertFalse(validate_semantic_event_if_enabled(ev))

    def test_sdk_module_validates_same_schema(self) -> None:
        sys_path_added = False
        repo = Path(__file__).resolve().parents[2]
        import sys

        if str(repo) not in sys.path:
            sys.path.insert(0, str(repo))
            sys_path_added = True
        try:
            from sdk.semantic_event_contract import validate_semantic_event as sdk_validate

            ev = build_event(
                event_type=EventType.DATASET_READINESS_UPDATED,
                tenant_id="t",
                project_id="p",
                resource_id="ds1",
                payload={"status": "ready"},
            )
            sdk_validate(ev)
        finally:
            if sys_path_added:
                sys.path.remove(str(repo))


if __name__ == "__main__":
    unittest.main()
