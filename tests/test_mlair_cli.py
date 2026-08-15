"""Public MLAir CLI surface tests."""

from __future__ import annotations

import unittest

from mlair.cli import PUBLIC_COMMANDS, build_parser, public_command_names


class TestMlairCli(unittest.TestCase):
    def test_public_commands_exact_set(self) -> None:
        names = public_command_names()
        self.assertEqual(names, set(PUBLIC_COMMANDS))

    def test_help_lists_only_public_commands(self) -> None:
        help_text = build_parser().format_help()
        for cmd in sorted(PUBLIC_COMMANDS):
            self.assertIn(cmd, help_text)

    def test_seed_subcommand_optional_all(self) -> None:
        parser = build_parser()
        args = parser.parse_args(["seed"])
        self.assertEqual(args.command, "seed")
        self.assertIsNone(args.target)
        args_all = parser.parse_args(["seed", "all"])
        self.assertEqual(args_all.target, "all")

    def test_remove_demo_subcommand(self) -> None:
        parser = build_parser()
        args = parser.parse_args(["remove", "demo"])
        self.assertEqual(args.remove_target, "demo")

    def test_db_subcommands(self) -> None:
        parser = build_parser()
        backup = parser.parse_args(["db", "backup"])
        self.assertEqual(backup.db_command, "backup")
        restore = parser.parse_args(["db", "restore", "--file", "backups/x.dump"])
        self.assertEqual(restore.backup_file, "backups/x.dump")

    def test_dev_subcommands(self) -> None:
        parser = build_parser()
        for argv in (["dev", "shell"], ["dev", "logs"], ["dev", "ps"]):
            args = parser.parse_args(argv)
            self.assertEqual(args.command, "dev")


if __name__ == "__main__":
    unittest.main()
