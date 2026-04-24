from __future__ import annotations

import logging
from importlib.metadata import entry_points
from typing import Any

from packaging.version import InvalidVersion, Version

logger = logging.getLogger(__name__)
PLUGIN_GROUP = "mlair.plugins"
MIN_ENGINE_VERSION = Version("1.0.0")


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
