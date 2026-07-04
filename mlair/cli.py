"""Unified MLAir command-line interface."""

from __future__ import annotations

import argparse
import json
import os
import sys

from mlair import __version__
from mlair.commands.doctor import run_doctor
from mlair.commands.health import run_health
from mlair.commands.legacy_http import cmd_logs, cmd_run
from mlair.commands.serve import run_build, run_rebuild, run_serve, run_start, run_stop
from mlair.config.loader import apply_to_environ, load_config, resolved_config


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
        description=(
            "MLAir lifecycle OS — one CLI, one container runtime (API, Hub, scheduler, executor, realtime). "
            "Sensible defaults; override via mlair.yaml when needed."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Quick start:\n"
            "  pip install -e .\n"
            "  mlair doctor\n"
            "  mlair build\n"
            "  mlair start\n"
            "  mlair health\n\n"
            "Configuration: docs/configuration.md"
        ),
    )
    parser.add_argument("--version", action="version", version=f"mlair {__version__}")
    _add_global_flags(parser)

    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Build images only (no start)")
    build.add_argument("--no-cache", action="store_true", help="Build without using cache")
    build.add_argument("--no-wheel", action="store_true", help="Skip repackaging the SDK wheel into dist/")
    build.set_defaults(func="_cmd_build")

    start = sub.add_parser("start", help="Start MLAir from existing images (no build)")
    start.add_argument("--foreground", action="store_true", help="Attach compose logs (no -d)")
    start.add_argument("--pull", action="store_true", help="Pull the image from its registry first (e.g. GHCR)")
    start.set_defaults(func="_cmd_start")

    rebuild = sub.add_parser("rebuild", help="Rebuild images then (re)start")
    rebuild.add_argument("--no-cache", action="store_true", help="Build without using cache")
    rebuild.add_argument("--no-wheel", action="store_true", help="Skip repackaging the SDK wheel into dist/")
    rebuild.add_argument("--foreground", action="store_true", help="Attach compose logs (no -d)")
    rebuild.set_defaults(func="_cmd_rebuild")

    sub.add_parser("stop", help="Stop compose stack").set_defaults(func="_cmd_stop")

    serve = sub.add_parser("serve", help="Deprecated alias: `start` (use `mlair start` / `build` / `rebuild`)")
    serve.add_argument("--build", action="store_true", help="Deprecated: rebuild before start (use `mlair rebuild`)")
    serve.add_argument("--foreground", action="store_true", help="Attach compose logs (no -d)")
    serve.set_defaults(func="_cmd_serve")

    sub.add_parser("doctor", help="Preflight checks (docker, ports, compose)").set_defaults(func="_cmd_doctor")

    health = sub.add_parser("health", help="Health check for running stack")
    health.add_argument("--wait-seconds", type=int, default=90)
    health.set_defaults(func="_cmd_health")

    cfg = sub.add_parser("config", help="Inspect resolved configuration")
    cfg_sub = cfg.add_subparsers(dest="config_command", required=True)
    cfg_print = cfg_sub.add_parser("print", help="Print merged config + effective env keys")
    cfg_print.add_argument("--json", action="store_true", help="JSON output")
    cfg_print.set_defaults(func="_cmd_config_print")

    run = sub.add_parser("run", help="Trigger a pipeline run from YAML/JSON file")
    run.add_argument("pipeline_file", help="Pipeline config (.yaml/.json)")
    run.set_defaults(func="_cmd_run")

    logs = sub.add_parser("logs", help="Read logs for a run")
    logs.add_argument("run_id", help="Run ID")
    logs.add_argument("--limit", type=int, default=200)
    logs.set_defaults(func="_cmd_logs")

    dev = sub.add_parser("dev", help="Deprecated alias for local development")
    dev_sub = dev.add_subparsers(dest="dev_command", required=True)
    dev_up = dev_sub.add_parser("up", help="Alias for `mlair start`")
    dev_up.set_defaults(func="_cmd_serve")

    return parser


def _profile_args(args: argparse.Namespace) -> tuple[str | None, str | None]:
    return args.profile, args.config_path


def _dispatch(args: argparse.Namespace) -> int:
    profile, config_path = _profile_args(args)
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
        return run_serve(
            build=bool(getattr(args, "build", False)),
            detach=not bool(getattr(args, "foreground", False)),
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
