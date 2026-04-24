from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.plugins.loader import load_plugins


@dataclass
class RegisteredPlugin:
    name: str
    version: str
    engine_version: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]
    ui_schema: dict[str, Any] | None
    enabled: bool


class PluginRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, Any] = {}
        self._enabled: dict[str, bool] = {}
        self._last_errors: list[dict[str, str]] = []

    def _meta(self, plugin: Any) -> dict[str, Any]:
        meta = getattr(plugin, "meta", None)
        if meta is None:
            raise ValueError("plugin.meta is required")
        if hasattr(meta, "model_dump"):
            return meta.model_dump()
        if isinstance(meta, dict):
            return meta
        return {
            "name": getattr(meta, "name", ""),
            "version": getattr(meta, "version", ""),
            "engine_version": getattr(meta, "engine_version", ""),
            "inputs": getattr(meta, "inputs", {}),
            "outputs": getattr(meta, "outputs", {}),
            "ui_schema": getattr(meta, "ui_schema", None),
        }

    def register(self, plugin: Any) -> None:
        meta = self._meta(plugin)
        name = str(meta["name"])
        if name in self._plugins:
            raise ValueError(f"duplicate plugin: {name}")
        self._plugins[name] = plugin
        self._enabled[name] = True

    def get(self, name: str) -> RegisteredPlugin | None:
        plugin = self._plugins.get(name)
        if not plugin:
            return None
        meta = self._meta(plugin)
        return RegisteredPlugin(
            name=str(meta["name"]),
            version=str(meta["version"]),
            engine_version=str(meta["engine_version"]),
            inputs=meta.get("inputs", {}) or {},
            outputs=meta.get("outputs", {}) or {},
            ui_schema=meta.get("ui_schema"),
            enabled=self._enabled.get(name, False),
        )

    def list(self) -> list[RegisteredPlugin]:
        items = [self.get(name) for name in sorted(self._plugins.keys())]
        return [item for item in items if item is not None]

    def enable(self, name: str, enabled: bool) -> bool:
        if name not in self._plugins:
            return False
        self._enabled[name] = enabled
        return True

    def plugin_instance(self, name: str) -> Any | None:
        if not self._enabled.get(name, False):
            return None
        return self._plugins.get(name)

    def reload(self) -> dict[str, Any]:
        loaded, errors = load_plugins()
        self._plugins = loaded
        self._enabled = {name: True for name in loaded.keys()}
        self._last_errors = errors
        return {"loaded": len(loaded), "errors": errors}

    def errors(self) -> list[dict[str, str]]:
        return list(self._last_errors)


plugin_registry = PluginRegistry()
