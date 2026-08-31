"""MLAir platform API token lifecycle (service-account secret + JWT refresh)."""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

_SA_SECRET_ENVS: tuple[str, ...] = (
    "ML_AIR_SA_EXECUTOR_SECRET",
    "ML_AIR_SA_SCHEDULER_SECRET",
    "ML_AIR_SA_WORKER_SECRET",
)

_ACCESS_TOKEN_ENVS: tuple[str, ...] = (
    "ML_AIR_ACCESS_TOKEN",
    "ML_AIR_SERVICE_ACCOUNT_TOKEN",
    "MLAIR_SERVICE_ACCOUNT_TOKEN",
    "ML_AIR_TRACKING_TOKEN",
    "ML_AIR_TOKEN",
)

_REFRESH_TOKEN_ENVS: tuple[str, ...] = (
    "ML_AIR_REFRESH_TOKEN",
    "MLAIR_REFRESH_TOKEN",
)

_AUTH_USERNAME_ENVS: tuple[str, ...] = (
    "ML_AIR_AUTH_USERNAME",
    "MLAIR_AUTH_USERNAME",
)

_AUTH_PASSWORD_ENVS: tuple[str, ...] = (
    "ML_AIR_AUTH_PASSWORD",
    "MLAIR_AUTH_PASSWORD",
    "ML_AIR_ADMIN_PASSWORD",
    "MLAIR_ADMIN_PASSWORD",
)

_DEFAULT_REFRESH_SKEW_SECONDS = 30


def _env_first(names: tuple[str, ...]) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _looks_like_jwt(token: str) -> bool:
    parts = token.split(".")
    return len(parts) == 3 and all(parts)


def _jwt_exp_unix(token: str) -> float | None:
    if not _looks_like_jwt(token):
        return None
    try:
        payload_b64 = token.split(".")[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        exp = payload.get("exp")
        return float(exp) if exp is not None else None
    except Exception:
        return None


def _api_base_url() -> str:
    for name in ("ML_AIR_API_BASE_URL", "CV_MLAIR_API_URL", "MLAIR_API_URL"):
        value = os.getenv(name, "").strip().rstrip("/")
        if value:
            return value
    return "http://127.0.0.1:8080"


@dataclass
class _TokenState:
    access_token: str = ""
    refresh_token: str = ""
    expires_at: float | None = None


class MLAirTokenManager:
    """Resolve Hub API bearer tokens with SA-secret preference and JWT refresh."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = _TokenState()
        self._refresh_skew_seconds = max(
            5,
            int(os.getenv("ML_AIR_TOKEN_REFRESH_SKEW_SECONDS", str(_DEFAULT_REFRESH_SKEW_SECONDS))),
        )

    def resolve_service_account_secret(self) -> str:
        return _env_first(_SA_SECRET_ENVS)

    def get_refresh_token(self) -> str:
        with self._lock:
            return self._state.refresh_token or _env_first(_REFRESH_TOKEN_ENVS)

    def get_access_token(self, *, force_refresh: bool = False) -> str:
        sa_secret = self.resolve_service_account_secret()
        if sa_secret and not force_refresh:
            return sa_secret

        with self._lock:
            if not force_refresh and self._access_token_valid_locked():
                return self._state.access_token

            self._acquire_or_refresh_locked(force_refresh=force_refresh)
            if self._state.access_token:
                return self._state.access_token

        for name in _ACCESS_TOKEN_ENVS:
            candidate = os.getenv(name, "").strip()
            if not candidate:
                continue
            if _looks_like_jwt(candidate):
                exp = _jwt_exp_unix(candidate)
                if exp is not None and exp <= time.time() + self._refresh_skew_seconds:
                    continue
            return candidate
        return ""

    def invalidate_access_token(self) -> None:
        with self._lock:
            self._state.access_token = ""
            self._state.expires_at = None

    def on_http_401(self) -> str:
        sa_secret = self.resolve_service_account_secret()
        if sa_secret:
            return sa_secret
        self.invalidate_access_token()
        return self.get_access_token(force_refresh=True)

    def sync_process_env(self, target: dict[str, str] | None = None) -> dict[str, str]:
        """Write the current effective bearer token into plugin/child process env."""
        env = target if target is not None else os.environ
        token = self.get_access_token()
        if not token:
            return env
        env["CV_MLAIR_TOKEN"] = token
        env["ML_AIR_TRACKING_TOKEN"] = token
        env["ML_AIR_TOKEN"] = token
        refresh = self.get_refresh_token()
        if refresh:
            env["ML_AIR_REFRESH_TOKEN"] = refresh
        sa_secret = self.resolve_service_account_secret()
        if sa_secret:
            for name in _SA_SECRET_ENVS:
                if os.getenv(name, "").strip():
                    env[name] = os.getenv(name, "").strip()
        elif _looks_like_jwt(token):
            env["ML_AIR_ACCESS_TOKEN"] = token
        return env

    def _access_token_valid_locked(self) -> bool:
        token = self._state.access_token.strip()
        if not token:
            return False
        if self._state.expires_at is None:
            exp = _jwt_exp_unix(token)
            self._state.expires_at = exp
        if self._state.expires_at is None:
            return True
        return self._state.expires_at > time.time() + self._refresh_skew_seconds

    def _acquire_or_refresh_locked(self, *, force_refresh: bool) -> None:
        refresh_token = self._state.refresh_token or _env_first(_REFRESH_TOKEN_ENVS)
        if refresh_token and (force_refresh or not self._access_token_valid_locked()):
            refreshed = self._refresh_session(refresh_token)
            if refreshed:
                self._apply_token_response_locked(refreshed)
                return

        username = _env_first(_AUTH_USERNAME_ENVS)
        password = _env_first(_AUTH_PASSWORD_ENVS)
        if username and password:
            logged_in = self._login(username, password)
            if logged_in:
                self._apply_token_response_locked(logged_in)
                return

        if not force_refresh:
            for name in _ACCESS_TOKEN_ENVS:
                candidate = os.getenv(name, "").strip()
                if not candidate or not _looks_like_jwt(candidate):
                    continue
                exp = _jwt_exp_unix(candidate)
                if exp is None or exp > time.time() + self._refresh_skew_seconds:
                    self._state.access_token = candidate
                    self._state.expires_at = exp
                    return

    def _apply_token_response_locked(self, payload: dict[str, Any]) -> None:
        access = str(payload.get("access_token") or "").strip()
        if not access:
            return
        self._state.access_token = access
        refresh = str(payload.get("refresh_token") or "").strip()
        if refresh:
            self._state.refresh_token = refresh
        expires_in = payload.get("expires_in")
        if expires_in is not None:
            try:
                self._state.expires_at = time.time() + float(expires_in)
            except (TypeError, ValueError):
                self._state.expires_at = _jwt_exp_unix(access)
        else:
            self._state.expires_at = _jwt_exp_unix(access)

    def _post_json(self, path: str, body: dict[str, Any], *, timeout: float = 30.0) -> dict[str, Any]:
        url = f"{_api_base_url()}{path}"
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8") if raw else "{}")

    def _refresh_session(self, refresh_token: str) -> dict[str, Any] | None:
        try:
            return self._post_json("/v1/auth/refresh", {"refresh_token": refresh_token})
        except urllib.error.HTTPError as exc:
            logger.warning("mlair_token_refresh_failed status=%s", exc.code)
        except Exception as exc:
            logger.warning("mlair_token_refresh_failed err=%s", exc)
        return None

    def _login(self, username: str, password: str) -> dict[str, Any] | None:
        try:
            return self._post_json("/v1/auth/login", {"username": username, "password": password})
        except urllib.error.HTTPError as exc:
            logger.warning("mlair_token_login_failed status=%s", exc.code)
        except Exception as exc:
            logger.warning("mlair_token_login_failed err=%s", exc)
        return None


_MANAGER: MLAirTokenManager | None = None
_MANAGER_LOCK = threading.Lock()


def get_platform_token_manager() -> MLAirTokenManager:
    global _MANAGER
    with _MANAGER_LOCK:
        if _MANAGER is None:
            _MANAGER = MLAirTokenManager()
        return _MANAGER


def resolve_platform_api_token(*, force_refresh: bool = False) -> str:
    """Return a valid Hub API bearer token for platform automation."""
    return get_platform_token_manager().get_access_token(force_refresh=force_refresh)
