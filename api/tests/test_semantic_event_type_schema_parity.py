"""Machine-checked parity: EventType enum vs mlair-semantic-event-v1 JSON Schema ``type`` enum."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.domains.lifecycle.realtime_events import EventType

_API_SCHEMA = Path(__file__).resolve().parents[1] / "app" / "schemas" / "mlair-semantic-event-v1.schema.json"
_SDK_SCHEMA = Path(__file__).resolve().parents[2] / "sdk" / "schemas" / "mlair-semantic-event-v1.schema.json"


def _type_enum_from_schema(path: Path) -> set[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    props = data.get("properties") or {}
    t = props.get("type") or {}
    enum = t.get("enum")
    if not isinstance(enum, list):
        raise AssertionError(f"{path}: missing properties.type.enum")
    return {str(x) for x in enum}


class TestSemanticEventTypeSchemaParity(unittest.TestCase):
    def test_event_type_values_match_api_schema_enum(self) -> None:
        self.assertTrue(_API_SCHEMA.is_file(), f"missing {_API_SCHEMA}")
        schema_types = _type_enum_from_schema(_API_SCHEMA)
        enum_values = {e.value for e in EventType}
        self.assertEqual(
            enum_values,
            schema_types,
            "EventType and JSON Schema ``type`` enum must match exactly "
            "(update both + sdk copy + realtime-event-envelope.md).",
        )

    def test_sdk_schema_matches_api_schema_type_enum(self) -> None:
        self.assertTrue(_SDK_SCHEMA.is_file(), f"missing {_SDK_SCHEMA}")
        api_t = _type_enum_from_schema(_API_SCHEMA)
        sdk_t = _type_enum_from_schema(_SDK_SCHEMA)
        self.assertEqual(api_t, sdk_t, "api/app/schemas and sdk/schemas semantic event copies must stay identical.")

    def test_event_type_has_no_duplicate_values(self) -> None:
        values = [e.value for e in EventType]
        self.assertEqual(len(values), len(set(values)), "EventType must not contain duplicate string values.")
