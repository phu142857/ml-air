from __future__ import annotations

import logging
import re
from importlib.metadata import entry_points
from typing import Any

from packaging.version import InvalidVersion, Version

logger = logging.getLogger(__name__)
PLUGIN_GROUP = "mlair.plugins"
MIN_ENGINE_VERSION = Version("1.0.0")
_SLOT_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$")


def _as_meta(plugin: Any) -> dict[str, Any]:
    meta = getattr(plugin, "meta", None)
    if meta is None:
        raise ValueError("missing plugin.meta")
    if hasattr(meta, "model_dump"):
        return meta.model_dump()  # pydantic model
    if isinstance(meta, dict):
        return meta
    return {
        "name": getattr(meta, "name", None),
        "version": getattr(meta, "version", None),
        "engine_version": getattr(meta, "engine_version", None),
        "inputs": getattr(meta, "inputs", {}),
        "outputs": getattr(meta, "outputs", {}),
        "ui_schema": getattr(meta, "ui_schema", None),
        "lineage": getattr(meta, "lineage", None),
    }


def _validate_meta(meta: dict[str, Any]) -> None:
    required = ("name", "version", "engine_version")
    for key in required:
        if not meta.get(key):
            raise ValueError(f"missing required meta field: {key}")
    if Version(str(meta["engine_version"])) < MIN_ENGINE_VERSION:
        raise ValueError(
            f"incompatible engine_version={meta['engine_version']}, minimum is {MIN_ENGINE_VERSION}"
        )
    Version(str(meta["version"]))  # validate semver-ish format
    _validate_lineage_meta(meta.get("lineage"))


def _validate_lineage_meta(lineage: Any) -> None:
    if lineage is None:
        return
    if not isinstance(lineage, dict):
        raise ValueError("invalid lineage meta: expected object")
    allowed_keys = {"inputs", "outputs"}
    unknown = [k for k in lineage.keys() if k not in allowed_keys]
    if unknown:
        raise ValueError(f"invalid lineage meta keys: {unknown}")
    for key in ("inputs", "outputs"):
        slots = lineage.get(key, [])
        if slots is None:
            continue
        if not isinstance(slots, list):
            raise ValueError(f"invalid lineage.{key}: expected list[str]")
        seen: set[str] = set()
        for raw_slot in slots:
            slot = str(raw_slot).strip()
            if not slot:
                raise ValueError(f"invalid lineage.{key}: empty slot name")
            if not _SLOT_NAME_RE.match(slot):
                raise ValueError(
                    f"invalid lineage.{key} slot '{slot}': use pattern {_SLOT_NAME_RE.pattern}"
                )
            if slot in seen:
                raise ValueError(f"invalid lineage.{key}: duplicate slot '{slot}'")
            seen.add(slot)


def load_plugins() -> tuple[dict[str, Any], list[dict[str, str]]]:
    plugins: dict[str, Any] = {}
    errors: list[dict[str, str]] = []
    for ep in entry_points(group=PLUGIN_GROUP):
        try:
            plugin_cls = ep.load()
            plugin = plugin_cls()
            meta = _as_meta(plugin)
            _validate_meta(meta)
            name = str(meta["name"])
            if name in plugins:
                raise ValueError(f"duplicate plugin name: {name}")
            plugins[name] = plugin
        except (InvalidVersion, Exception) as exc:  # noqa: BLE001
            logger.warning("skip invalid plugin entry point %s: %s", ep.name, exc)
            errors.append({"entry_point": ep.name, "error": str(exc)})
    return plugins, errors
