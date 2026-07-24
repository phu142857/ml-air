"""Project-root .env loading for the MLAir CLI."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mlair.compose_cli import compose_argv
from mlair.env import find_semantic_signing_issues, load_project_env, sanitize_env_value


class TestMlairProjectEnv(unittest.TestCase):
    def test_load_project_env_does_not_override_shell(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env_file = root / ".env"
            env_file.write_text("MLAIR_PORT=7777\nML_AIR_BOOTSTRAP_ADMIN_USERNAME=from_file\n", encoding="utf-8")
            with patch.dict(os.environ, {"MLAIR_PORT": "8888"}, clear=False):
                with patch("mlair.env.default_env_file", return_value=env_file):
                    load_project_env()
                self.assertEqual(os.environ.get("MLAIR_PORT"), "8888")
                self.assertEqual(os.environ.get("ML_AIR_BOOTSTRAP_ADMIN_USERNAME"), "from_file")

    def test_compose_argv_uses_repo_root_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env_file = root / ".env"
            env_file.write_text("MLAIR_PORT=7777\n", encoding="utf-8")
            compose_file = root / "deploy" / "docker-compose.allinone.yml"
            compose_file.parent.mkdir(parents=True)
            compose_file.write_text("services: {}\n", encoding="utf-8")
            with patch("mlair.compose_cli.default_env_file", return_value=env_file):
                argv = compose_argv(compose_file, "config", "-q")
            self.assertNotIn("--project-directory", argv)
            self.assertIn("--env-file", argv)
            self.assertEqual(argv[argv.index("--env-file") + 1], str(env_file.resolve()))
            self.assertEqual(argv[argv.index("-f") + 1], str(compose_file.resolve()))

    def test_sanitize_unexpanded_compose_default(self) -> None:
        self.assertEqual(
            sanitize_env_value("ML_AIR_SCHEDULER_METRICS_PORT", "${ML_AIR_SCHEDULER_METRICS_PORT:-9102}"),
            "9102",
        )

    def test_sanitize_allinone_redis_hostname(self) -> None:
        self.assertEqual(
            sanitize_env_value("ML_AIR_REDIS_URL", "redis://redis:6379/0", allinone=True),
            "redis://127.0.0.1:6379/0",
        )

    def test_load_project_env_sanitizes_for_allinone(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env_file = root / ".env"
            env_file.write_text(
                "ML_AIR_SCHEDULER_METRICS_PORT=${ML_AIR_SCHEDULER_METRICS_PORT:-9102}\n"
                "ML_AIR_REDIS_URL=redis://redis:6379/0\n",
                encoding="utf-8",
            )
            with patch.dict(os.environ, {}, clear=True):
                with patch("mlair.env.default_env_file", return_value=env_file):
                    load_project_env(allinone=True)
                self.assertEqual(os.environ.get("ML_AIR_SCHEDULER_METRICS_PORT"), "9102")
                self.assertEqual(os.environ.get("ML_AIR_REDIS_URL"), "redis://127.0.0.1:6379/0")

    def test_find_semantic_signing_issues_when_key_missing(self) -> None:
        with patch.dict(
            os.environ,
            {"ML_AIR_SEMANTIC_EVENT_SIGNING": "1", "ML_AIR_SEMANTIC_EVENT_SIGNING_KEY": ""},
            clear=False,
        ):
            issues = find_semantic_signing_issues()
        self.assertEqual(len(issues), 1)
        self.assertIn("SEMANTIC_EVENT_SIGNING", issues[0])

    def test_find_semantic_signing_issues_when_key_present(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ML_AIR_SEMANTIC_EVENT_SIGNING": "1",
                "ML_AIR_SEMANTIC_EVENT_SIGNING_KEY": "dev-key",
            },
            clear=False,
        ):
            self.assertEqual(find_semantic_signing_issues(), [])


if __name__ == "__main__":
    unittest.main()
