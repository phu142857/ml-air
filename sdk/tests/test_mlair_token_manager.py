"""Regression tests for MLAir platform token lifecycle."""

from __future__ import annotations

import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sdk.mlair_token_manager import MLAirTokenManager, get_platform_token_manager, resolve_platform_api_token


def _jwt_with_exp(exp: int) -> str:
    header = json.dumps({"alg": "none", "typ": "JWT"}).encode()
    payload = json.dumps({"exp": exp}).encode()
    import base64

    def b64(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode().rstrip("=")

    return f"{b64(header)}.{b64(payload)}.sig"


class MLAirTokenManagerTest(unittest.TestCase):
    def setUp(self) -> None:
        import sdk.mlair_token_manager as tm

        tm._MANAGER = None
        self._env = mock.patch.dict(os.environ, {}, clear=True)
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()
        import sdk.mlair_token_manager as tm

        tm._MANAGER = None

    def test_sa_secret_not_selected_as_hub_jwt(self) -> None:
        os.environ["ML_AIR_SA_EXECUTOR_SECRET"] = "sa-long-lived-secret"
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) + 60)
        mgr = MLAirTokenManager()
        token = mgr.get_hub_jwt_token()
        self.assertTrue(token.startswith("ey"))
        self.assertNotEqual(token, "sa-long-lived-secret")

    def test_worker_auth_token_returns_sa_secret(self) -> None:
        os.environ["ML_AIR_SA_EXECUTOR_SECRET"] = "sa-long-lived-secret"
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) + 60)
        mgr = MLAirTokenManager()
        self.assertEqual(mgr.get_worker_auth_token(), "sa-long-lived-secret")

    def test_refresh_on_expired_access_token(self) -> None:
        os.environ["ML_AIR_REFRESH_TOKEN"] = "refresh-abc"
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) - 10)
        mgr = MLAirTokenManager()
        with mock.patch.object(
            mgr,
            "_refresh_session",
            return_value={
                "access_token": "new-access",
                "refresh_token": "new-refresh",
                "expires_in": 900,
            },
        ) as refresh:
            token = mgr.get_hub_jwt_token()
        refresh.assert_called_once_with("refresh-abc")
        self.assertEqual(token, "new-access")
        self.assertEqual(mgr.get_refresh_token(), "new-refresh")

    def test_on_http_401_refreshes_jwt(self) -> None:
        os.environ["ML_AIR_SA_EXECUTOR_SECRET"] = "sa-secret"
        os.environ["ML_AIR_REFRESH_TOKEN"] = "refresh-abc"
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) + 600)
        mgr = MLAirTokenManager()
        with mock.patch.object(
            mgr,
            "_refresh_session",
            return_value={"access_token": "after-401", "expires_in": 900},
        ):
            token = mgr.on_http_401()
        self.assertEqual(token, "after-401")
        self.assertNotEqual(token, "sa-secret")

    def test_sync_process_env_separates_jwt_and_sa(self) -> None:
        os.environ["ML_AIR_SA_EXECUTOR_SECRET"] = "sa-secret"
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) + 3600)
        env: dict[str, str] = {}
        MLAirTokenManager().sync_process_env(env)
        self.assertTrue(env["CV_MLAIR_TOKEN"].startswith("ey"))
        self.assertNotEqual(env["CV_MLAIR_TOKEN"], "sa-secret")
        self.assertEqual(env["ML_AIR_SERVICE_ACCOUNT_TOKEN"], "sa-secret")
        self.assertEqual(env["ML_AIR_SA_EXECUTOR_SECRET"], "sa-secret")
        self.assertEqual(env["ML_AIR_ACCESS_TOKEN"], env["CV_MLAIR_TOKEN"])

    def test_dataset_download_uses_jwt_not_sa(self) -> None:
        os.environ["ML_AIR_SA_EXECUTOR_SECRET"] = "sa-secret"
        jwt = _jwt_with_exp(int(time.time()) + 3600)
        os.environ["ML_AIR_ACCESS_TOKEN"] = jwt
        mgr = MLAirTokenManager()
        env: dict[str, str] = {}
        mgr.sync_process_env(env)
        self.assertEqual(env["CV_MLAIR_TOKEN"], jwt)
        self.assertNotEqual(env["CV_MLAIR_TOKEN"], mgr.get_worker_auth_token())

    def test_long_running_ttl_simulation(self) -> None:
        """TTL=900s, training >900s: eval-time refresh must yield a valid JWT."""
        os.environ["ML_AIR_REFRESH_TOKEN"] = "refresh-long-run"
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) - 1200)
        mgr = MLAirTokenManager()
        with mock.patch.object(
            mgr,
            "_refresh_session",
            return_value={"access_token": "post-train-access", "expires_in": 900},
        ):
            train_started = time.time() - 1200
            self.assertGreater(time.time() - train_started, 900)
            token = mgr.get_hub_jwt_token()
        self.assertEqual(token, "post-train-access")

    def test_valid_token_unchanged_without_refresh(self) -> None:
        os.environ["ML_AIR_ACCESS_TOKEN"] = _jwt_with_exp(int(time.time()) + 3600)
        mgr = MLAirTokenManager()
        with mock.patch.object(mgr, "_refresh_session") as refresh:
            token = mgr.get_hub_jwt_token()
        refresh.assert_not_called()
        self.assertTrue(token.startswith("ey"))


if __name__ == "__main__":
    unittest.main()
