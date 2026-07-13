"""MLAir semantic event envelope v1 — JSON Schema validation for integrators and CI."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, ValidationError, validate

SCHEMA_FILENAME = "mlair-semantic-event-v1.schema.json"

KNOWN_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "run.created",
        "run.updated",
        "run.tracking.updated",
        "task.updated",
        "model.promoted",
        "model.eligibility.updated",
        "dataset.updated",
        "dataset.buffer.updated",
        "buffer.threshold_met",
        "dataset.version.created",
        "dataset.readiness.updated",
        "training.eligibility.updated",
        "eligibility.updated",
        "training.policy.updated",
        "training.triggered",
        "training.completed",
    }
)


def _schema_search_paths() -> list[Path]:
    here = Path(__file__).resolve().parent
    repo_root = here.parent
    return [
        here / "schemas" / SCHEMA_FILENAME,
        repo_root / "api" / "app" / "schemas" / SCHEMA_FILENAME,
    ]


@lru_cache(maxsize=1)
def load_schema() -> dict[str, Any]:
    for path in _schema_search_paths():
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(
        f"semantic event schema not found (tried: {', '.join(str(p) for p in _schema_search_paths())})"
    )


@lru_cache(maxsize=1)
def validator() -> Draft202012Validator:
    return Draft202012Validator(load_schema())


def validate_semantic_event(event: dict[str, Any]) -> None:
    """Raise ``jsonschema.ValidationError`` when *event* is not a valid v1 envelope."""
    validate(instance=event, schema=load_schema())


def is_valid_semantic_event(event: dict[str, Any]) -> bool:
    try:
        validate_semantic_event(event)
    except ValidationError:
        return False
    return True


def format_validation_error(exc: ValidationError) -> str:
    path = ".".join(str(p) for p in exc.absolute_path) or "(root)"
    return f"{path}: {exc.message}"


def main() -> int:
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Validate MLAir semantic event JSON (v1 envelope).")
    parser.add_argument(
        "file",
        nargs="?",
        help="Path to JSON file (default: stdin)",
    )
    args = parser.parse_args()
    raw = Path(args.file).read_text(encoding="utf-8") if args.file else sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"invalid JSON: {exc}", file=sys.stderr)
        return 2
    if not isinstance(data, dict):
        print("expected a JSON object", file=sys.stderr)
        return 2
    try:
        validate_semantic_event(data)
    except ValidationError as exc:
        print(format_validation_error(exc), file=sys.stderr)
        return 1
    print("ok", data.get("type"), data.get("event_id"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
