"""Plugin ↔ MLAir engine compatibility and version constraint checks."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from packaging.specifiers import SpecifierSet
from packaging.version import InvalidVersion, Version

_MATRIX_PATH = Path(__file__).resolve().parent / "plugin_compatibility_matrix.json"
DEFAULT_ENGINE_VERSION = "1.0.0"


def current_engine_version() -> str:
    return str(os.getenv("MLAIR_ENGINE_VERSION", DEFAULT_ENGINE_VERSION)).strip() or DEFAULT_ENGINE_VERSION


@lru_cache(maxsize=1)
def load_compatibility_matrix() -> dict[str, Any]:
    if not _MATRIX_PATH.is_file():
        return {"matrix_version": "1", "engine": {}, "plugins": {}}
    with _MATRIX_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def version_satisfies(installed: str, constraint: str) -> bool:
    """True when ``installed`` matches PEP 440 specifier (e.g. ``>=1.2.0,<2`` or ``==1.2.0``)."""
    inst = str(installed or "").strip()
    spec_raw = str(constraint or "").strip()
    if not inst or not spec_raw:
        return False
    try:
        v = Version(inst)
    except InvalidVersion as exc:
        raise ValueError(f"invalid_installed_version:{inst}") from exc
    if not any(op in spec_raw for op in ("<", ">", "=", "!", "~")):
        spec_raw = f"=={spec_raw}"
    try:
        return v in SpecifierSet(spec_raw)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"invalid_version_constraint:{spec_raw}") from exc


@dataclass
class PluginCompatibilityResult:
    plugin_name: str
    plugin_version: str
    engine_version: str
    compatible: bool
    reasons: list[dict[str, str]] = field(default_factory=list)
    matrix_version: str = "1"
    mlair_engine_version: str = DEFAULT_ENGINE_VERSION
    engine_supported_range: str | None = None
    plugin_version_range: str | None = None
    version_constraint: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "plugin_name": self.plugin_name,
            "plugin_version": self.plugin_version,
            "engine_version": self.engine_version,
            "compatible": self.compatible,
            "reasons": self.reasons,
            "matrix_version": self.matrix_version,
            "mlair_engine_version": self.mlair_engine_version,
            "engine_supported_range": self.engine_supported_range,
            "plugin_version_range": self.plugin_version_range,
            "version_constraint": self.version_constraint,
        }


def evaluate_plugin_compatibility(
    *,
    plugin_name: str,
    plugin_version: str,
    engine_version: str,
    version_constraint: str | None = None,
    matrix: dict[str, Any] | None = None,
) -> PluginCompatibilityResult:
    """Evaluate plugin meta against matrix and optional pipeline pin."""
    mat = matrix if matrix is not None else load_compatibility_matrix()
    engine_cfg = mat.get("engine") if isinstance(mat.get("engine"), dict) else {}
    plugins_cfg = mat.get("plugins") if isinstance(mat.get("plugins"), dict) else {}
    mlair_eng = current_engine_version()
    supported_range = str(engine_cfg.get("supported_range") or ">=1.0.0,<2.0.0")
    min_plugin = str(engine_cfg.get("min_plugin_version") or "0.1.0")
    per_plugin = plugins_cfg.get(plugin_name) if isinstance(plugins_cfg.get(plugin_name), dict) else {}
    plugin_range = str(per_plugin.get("version_range") or "").strip() or None

    reasons: list[dict[str, str]] = []
    compatible = True

    try:
        if not version_satisfies(engine_version, supported_range):
            compatible = False
            reasons.append(
                {
                    "code": "engine_version_incompatible",
                    "message": f"plugin engine_version {engine_version} not in {supported_range}",
                }
            )
    except ValueError as exc:
        compatible = False
        reasons.append({"code": "engine_version_invalid", "message": str(exc)})

    try:
        if not version_satisfies(plugin_version, f">={min_plugin}"):
            compatible = False
            reasons.append(
                {
                    "code": "plugin_version_below_minimum",
                    "message": f"plugin version {plugin_version} below minimum {min_plugin}",
                }
            )
    except ValueError as exc:
        compatible = False
        reasons.append({"code": "plugin_version_invalid", "message": str(exc)})

    if plugin_range:
        try:
            if not version_satisfies(plugin_version, plugin_range):
                compatible = False
                reasons.append(
                    {
                        "code": "plugin_version_out_of_matrix_range",
                        "message": f"plugin version {plugin_version} not in matrix range {plugin_range}",
                    }
                )
        except ValueError as exc:
            compatible = False
            reasons.append({"code": "plugin_version_constraint_invalid", "message": str(exc)})

    if version_constraint:
        try:
            if not version_satisfies(plugin_version, version_constraint):
                compatible = False
                reasons.append(
                    {
                        "code": "plugin_version_pin_mismatch",
                        "message": f"installed {plugin_version} does not satisfy pin {version_constraint}",
                    }
                )
        except ValueError as exc:
            compatible = False
            reasons.append({"code": "plugin_version_pin_invalid", "message": str(exc)})

    return PluginCompatibilityResult(
        plugin_name=plugin_name,
        plugin_version=plugin_version,
        engine_version=engine_version,
        compatible=compatible,
        reasons=reasons,
        matrix_version=str(mat.get("matrix_version") or "1"),
        mlair_engine_version=mlair_eng,
        engine_supported_range=supported_range,
        plugin_version_range=plugin_range,
        version_constraint=version_constraint,
    )


def compatibility_matrix_summary(matrix: dict[str, Any] | None = None) -> dict[str, Any]:
    mat = matrix if matrix is not None else load_compatibility_matrix()
    engine_cfg = mat.get("engine") if isinstance(mat.get("engine"), dict) else {}
    return {
        "matrix_version": str(mat.get("matrix_version") or "1"),
        "mlair_engine_version": current_engine_version(),
        "engine": {
            "supported_range": str(engine_cfg.get("supported_range") or ">=1.0.0,<2.0.0"),
            "min_plugin_version": str(engine_cfg.get("min_plugin_version") or "0.1.0"),
        },
        "plugins": mat.get("plugins") if isinstance(mat.get("plugins"), dict) else {},
    }


def validate_pipeline_plugin_versions(
    tasks: list[Any],
    *,
    resolve_plugin_meta: Any,
) -> list[str]:
    """Return human-readable errors for task plugin version pins."""
    errors: list[str] = []
    for item in tasks:
        if not isinstance(item, dict):
            continue
        if str(item.get("type") or "").strip().lower() == "http":
            continue
        plugin_name = str(item.get("plugin") or "").strip()
        if not plugin_name:
            continue
        pin = str(item.get("plugin_version") or item.get("requires_plugin_version") or "").strip() or None
        if not pin:
            continue
        meta = resolve_plugin_meta(plugin_name)
        if not meta:
            errors.append(f"Task {item.get('id')}: unknown plugin '{plugin_name}' for version pin")
            continue
        result = evaluate_plugin_compatibility(
            plugin_name=plugin_name,
            plugin_version=str(meta.get("version") or ""),
            engine_version=str(meta.get("engine_version") or ""),
            version_constraint=pin,
        )
        if not result.compatible:
            msg = result.reasons[0]["message"] if result.reasons else "incompatible"
            errors.append(f"Task {item.get('id')}: {msg}")
    return errors
