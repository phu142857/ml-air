"""Unit tests for sdk.environment.collect_environment."""

from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from sdk.environment import collect_environment


class CollectEnvironmentTests(unittest.TestCase):
    def test_includes_python_version(self) -> None:
        env = collect_environment(include_pip_digest=False)
        self.assertIn("python_version", env)
        self.assertTrue(str(env["python_version"])[0].isdigit())

    def test_includes_default_hardware_fields(self) -> None:
        env = collect_environment(include_pip_digest=False)
        self.assertIn("machine", env)
        self.assertIn("cpu_count", env)
        self.assertIn("runtime_kind", env)
        self.assertIn("captured_at", env)

    def test_capturer_is_recorded(self) -> None:
        env = collect_environment(include_pip_digest=False, capturer="mlair-api")
        self.assertEqual(env.get("capturer"), "mlair-api")

    @patch("sdk.environment._run_git")
    def test_git_fields_when_available(self, mock_git: MagicMock) -> None:
        def side_effect(args: list[str], cwd: str | None = None) -> str | None:
            if args[:2] == ["rev-parse", "HEAD"]:
                return "abc123"
            if args[:2] == ["rev-parse", "--abbrev-ref"]:
                return "main"
            if args[0] == "status":
                return ""
            return None

        mock_git.side_effect = side_effect
        with patch("sdk.environment._git_roots", return_value=["/repo"]):
            env = collect_environment(include_pip_digest=False)
        self.assertEqual(env.get("git", {}).get("commit"), "abc123")
        self.assertEqual(env.get("git", {}).get("branch"), "main")

    @patch.dict(
        os.environ,
        {
            "MLAIR_SOURCE_COMMIT": "deadbeef",
            "MLAIR_SOURCE_BRANCH": "release",
            "ML_AIR_GIT_ROOT": "",
        },
        clear=False,
    )
    @patch("sdk.environment._git_roots", return_value=[])
    def test_git_from_build_env_when_no_repo(self, _roots: MagicMock) -> None:
        env = collect_environment(include_pip_digest=False)
        self.assertEqual(env.get("git", {}).get("commit"), "deadbeef")
        self.assertEqual(env.get("git", {}).get("branch"), "release")
        self.assertEqual(env.get("git", {}).get("source"), "build")

    @patch.dict(os.environ, {"MLAIR_IMAGE_REF": "ghcr.io/org/ml-air-api:v1"}, clear=False)
    def test_docker_image_from_mlair_image_ref(self) -> None:
        env = collect_environment(include_pip_digest=False)
        self.assertEqual(env.get("docker_image"), "ghcr.io/org/ml-air-api:v1")

    @patch.dict(
        os.environ,
        {
            "ML_AIR_ENVIRONMENT": "staging",
            "OTEL_SERVICE_NAME": "mlair-api",
        },
        clear=False,
    )
    def test_deployment_fields_from_env(self) -> None:
        env = collect_environment(include_pip_digest=False)
        self.assertEqual(env.get("ml_air_environment"), "staging")
        self.assertEqual(env.get("service_name"), "mlair-api")

    @patch.dict(os.environ, {}, clear=False)
    @patch("sdk.environment.Path.exists", return_value=True)
    def test_runtime_kind_container(self, _exists: MagicMock) -> None:
        os.environ.pop("KUBERNETES_SERVICE_HOST", None)
        env = collect_environment(include_pip_digest=False)
        self.assertEqual(env.get("runtime_kind"), "container")


if __name__ == "__main__":
    unittest.main()
