"""Project-root .env loading for the MLAir CLI."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mlair.compose_cli import compose_argv
from mlair.env import load_project_env


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


if __name__ == "__main__":
    unittest.main()
