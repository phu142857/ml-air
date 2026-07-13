"""Policy reads for scheduler / executor / realtime (Package 002).

L3 connection strings and L1 tuning intervals remain ``os.getenv`` in worker processes.
Policy / feature flags resolve through the central Settings loader when ``app`` is on PYTHONPATH.
"""

from __future__ import annotations

import os


def _settings():
    try:
        from app.settings import get_settings

        return get_settings()
    except Exception:
        return None


def _env_bool(name: str, *, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    text = str(raw).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _env_int(name: str, *, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(minimum, min(maximum, int(raw)))
    except ValueError:
        return default


def otel_enabled() -> bool:
    settings = _settings()
    if settings is not None:
        return settings.features.otel_enabled
    return _env_bool("ML_AIR_OTEL_ENABLED", default=True)


def event_stream_enabled() -> bool:
    settings = _settings()
    if settings is not None:
        return settings.features.event_stream
    return _env_bool("ML_AIR_EVENT_STREAM", default=True)


def event_stream_global_fanout_enabled() -> bool:
    settings = _settings()
    if settings is not None:
        return settings.features.event_stream_global_fanout
    return _env_bool("ML_AIR_EVENT_STREAM_GLOBAL_FANOUT", default=True)


def event_replay_buffer_size() -> int:
    return _env_int("ML_AIR_EVENT_REPLAY_BUFFER_SIZE", default=1000, minimum=50, maximum=10_000)


def event_stream_maxlen() -> int:
    return _env_int("ML_AIR_EVENT_STREAM_MAXLEN", default=50_000, minimum=1000, maximum=1_000_000)


def event_stream_global_maxlen() -> int:
    return _env_int("ML_AIR_EVENT_STREAM_GLOBAL_MAXLEN", default=200_000, minimum=5000, maximum=5_000_000)


def replay_require_artifact_evidence() -> bool:
    return _env_bool("ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE", default=True)


def replay_require_checksum() -> bool:
    settings = _settings()
    if settings is not None:
        return settings.features.replay_require_checksum
    return _env_bool("ML_AIR_REPLAY_REQUIRE_CHECKSUM", default=True)


def replay_require_signed_manifest() -> bool:
    settings = _settings()
    if settings is not None:
        return settings.features.replay_require_signed_manifest
    return _env_bool("ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST", default=True)


def manifest_strict_key_lifecycle() -> bool:
    settings = _settings()
    if settings is not None:
        return settings.features.manifest_strict_key_lifecycle
    return _env_bool("ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE", default=True)
