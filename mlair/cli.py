"""Unified MLAir command-line interface."""

from __future__ import annotations

import argparse
import json
import os
import sys

from mlair import __version__
from mlair.commands.db import run_db_backup, run_db_restore
from mlair.commands.dev import run_dev_logs, run_dev_ps, run_dev_shell
from mlair.commands.doctor import run_doctor
from mlair.commands.health import run_health
from mlair.commands.legacy_http import cmd_logs, cmd_run
from mlair.commands.remove import run_remove_demo
from mlair.commands.seed import run_seed
from mlair.commands.serve import (
    run_build,
    run_dev_api_server,
    run_rebuild,
    run_start,
    run_stop,
)
from mlair.config.loader import apply_to_environ, load_config, resolved_config
from mlair.env import load_project_env
from mlair.paths import repo_root

PUBLIC_COMMANDS = frozenset(
    {
        "build",
        "start",
        "stop",
        "rebuild",
        "serve",
        "doctor",
        "health",
        "config",
        "run",
        "logs",
        "seed",
        "remove",
        "db",
        "dev",
    }
)


def _add_global_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--profile",
        default=os.getenv("MLAIR_PROFILE"),
        help="Config profile: development (default), staging, production",
    )
    parser.add_argument(
        "--config",
        dest="config_path",
        default=os.getenv("MLAIR_CONFIG"),
        help="Path to mlair.yaml (default: ./mlair.yaml or ~/.config/mlair/mlair.yaml)",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mlair",
        description="MLAir public operator CLI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Quick start:\n"
            "  mlair doctor && mlair build && mlair start && mlair health\n\n"
            "Configuration: docs/configuration.md"
        ),
    )
    parser.add_argument("--version", action="version", version=f"mlair {__version__}")
    _add_global_flags(parser)

    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Build application/images")
    build.add_argument("--no-cache", action="store_true", help="Build without using cache")
    build.add_argument("--no-wheel", action="store_true", help="Skip repackaging the SDK wheel into dist/")
    build.set_defaults(func="_cmd_build")

    start = sub.add_parser("start", help="Start MLAir services")
    start.add_argument("--foreground", action="store_true", help="Attach compose logs (no -d)")
    start.add_argument("--pull", action="store_true", help="Pull images from registry before start")
    start.set_defaults(func="_cmd_start")

    sub.add_parser("stop", help="Stop MLAir services").set_defaults(func="_cmd_stop")

    rebuild = sub.add_parser("rebuild", help="Rebuild and restart services")
    rebuild.add_argument("--no-cache", action="store_true", help="Build without using cache")
    rebuild.add_argument("--no-wheel", action="store_true", help="Skip repackaging the SDK wheel into dist/")
    rebuild.add_argument("--foreground", action="store_true", help="Attach compose logs (no -d)")
    rebuild.set_defaults(func="_cmd_rebuild")

    serve = sub.add_parser("serve", help="Run development/API server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8080)
    serve.add_argument("--reload", action="store_true", help="Enable uvicorn auto-reload")
    serve.set_defaults(func="_cmd_serve")

    sub.add_parser("doctor", help="Check environment and diagnose problems").set_defaults(func="_cmd_doctor")

    health = sub.add_parser("health", help="Check service health")
    health.add_argument("--wait-seconds", type=int, default=90)
    health.set_defaults(func="_cmd_health")

    cfg = sub.add_parser("config", help="View/manage configuration")
    cfg_sub = cfg.add_subparsers(dest="config_command", required=True)
    cfg_print = cfg_sub.add_parser("print", help="Print merged config and effective env keys")
    cfg_print.add_argument("--json", action="store_true", help="JSON output")
    cfg_print.set_defaults(func="_cmd_config_print")

    run = sub.add_parser("run", help="Create and manage ML runs")
    run.add_argument("pipeline_file", help="Pipeline config (.yaml/.json)")
    run.set_defaults(func="_cmd_run")

    logs = sub.add_parser("logs", help="View/stream run logs")
    logs.add_argument("run_id", help="Run ID")
    logs.add_argument("--limit", type=int, default=200)
    logs.set_defaults(func="_cmd_logs")

    seed = sub.add_parser("seed", help="Create demo data")
    seed.add_argument(
        "target",
        nargs="?",
        choices=("all",),
        help="Use `all` to run every demo seed script (default: primary hub demo)",
    )
    seed.set_defaults(func="_cmd_seed")

    remove = sub.add_parser("remove", help="Remove seeded resources")
    remove_sub = remove.add_subparsers(dest="remove_target", required=True)
    remove_sub.add_parser("demo", help="Remove all demo data").set_defaults(func="_cmd_remove_demo")

    db = sub.add_parser("db", help="Database backup and restore")
    db_sub = db.add_subparsers(dest="db_command", required=True)
    db_backup = db_sub.add_parser("backup", help="Backup database")
    db_backup.add_argument(
        "--output-dir",
        default=None,
        help="Backup directory (default: backups/postgres or MLAIR_BACKUP_DIR)",
    )
    db_backup.set_defaults(func="_cmd_db_backup")
    db_restore = db_sub.add_parser("restore", help="Restore database")
    db_restore.add_argument("--file", required=True, dest="backup_file", help="Path to .dump backup file")
    db_restore.set_defaults(func="_cmd_db_restore")

    dev = sub.add_parser("dev", help="Development utilities")
    dev_sub = dev.add_subparsers(dest="dev_command", required=True)
    dev_sub.add_parser("shell", help="Open a shell in the main MLAir container").set_defaults(func="_cmd_dev_shell")
    dev_logs = dev_sub.add_parser("logs", help="Stream Docker Compose service logs")
    dev_logs.add_argument("service", nargs="?", default=None, help="Optional service name")
    dev_logs.add_argument("--no-follow", action="store_true", help="Do not follow log output")
    dev_logs.set_defaults(func="_cmd_dev_logs")
    dev_sub.add_parser("ps", help="Show compose service status").set_defaults(func="_cmd_dev_ps")

    return parser


def public_command_names(parser: argparse.ArgumentParser | None = None) -> set[str]:
    root = parser or build_parser()
    action = root._subparsers._group_actions[0]  # type: ignore[attr-defined]
    return set(action.choices.keys())


def _profile_args(args: argparse.Namespace) -> tuple[str | None, str | None]:
    return args.profile, args.config_path


def _dispatch(args: argparse.Namespace) -> int:
    profile, config_path = _profile_args(args)
    os.chdir(repo_root())
    load_project_env()
    cfg = load_config(config_path, profile=profile)
    apply_to_environ(cfg)

    func = args.func
    if func == "_cmd_build":
        return run_build(
            no_cache=bool(getattr(args, "no_cache", False)),
            wheel=not bool(getattr(args, "no_wheel", False)),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_start":
        return run_start(
            detach=not bool(getattr(args, "foreground", False)),
            pull=bool(getattr(args, "pull", False)),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_rebuild":
        return run_rebuild(
            no_cache=bool(getattr(args, "no_cache", False)),
            wheel=not bool(getattr(args, "no_wheel", False)),
            detach=not bool(getattr(args, "foreground", False)),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_serve":
        return run_dev_api_server(
            host=str(getattr(args, "host", "127.0.0.1")),
            port=int(getattr(args, "port", 8080)),
            reload=bool(getattr(args, "reload", False)),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_stop":
        return run_stop(profile=profile, config_path=config_path)
    if func == "_cmd_doctor":
        return run_doctor(profile=profile, config_path=config_path)
    if func == "_cmd_health":
        return run_health(
            profile=profile,
            config_path=config_path,
            wait_seconds=int(getattr(args, "wait_seconds", 90)),
        )
    if func == "_cmd_config_print":
        data = resolved_config(config_path, profile=profile)
        if getattr(args, "json", False):
            print(json.dumps(data, indent=2, default=str))
        else:
            print(yaml_dump_safe(data))
        return 0
    if func == "_cmd_run":
        return cmd_run(args)
    if func == "_cmd_logs":
        return cmd_logs(args)
    if func == "_cmd_seed":
        return run_seed(target=getattr(args, "target", None))
    if func == "_cmd_remove_demo":
        return run_remove_demo()
    if func == "_cmd_db_backup":
        return run_db_backup(
            output_dir=getattr(args, "output_dir", None),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_db_restore":
        return run_db_restore(
            backup_file=str(args.backup_file),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_dev_shell":
        return run_dev_shell(profile=profile, config_path=config_path)
    if func == "_cmd_dev_logs":
        return run_dev_logs(
            follow=not bool(getattr(args, "no_follow", False)),
            service=getattr(args, "service", None),
            profile=profile,
            config_path=config_path,
        )
    if func == "_cmd_dev_ps":
        return run_dev_ps(profile=profile, config_path=config_path)
    print(f"unknown command handler: {func}", file=sys.stderr)
    return 2


def yaml_dump_safe(data: object) -> str:
    import yaml

    return yaml.safe_dump(data, sort_keys=False, default_flow_style=False)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return _dispatch(args)


if __name__ == "__main__":
    raise SystemExit(main())
