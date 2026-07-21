#!/usr/bin/env python3
"""Preflight checks — delegates to unified ``mlair doctor``."""

from __future__ import annotations

import sys

from mlair.commands.doctor import run_doctor


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Preflight checks for MLAir quickstart.")
    parser.add_argument("--compose-file", default="deploy/docker-compose.quickstart.yml")
    parser.add_argument("--profile", default=None)
    parser.add_argument("--config", dest="config_path", default=None)
    args = parser.parse_args()
    if args.compose_file:
        import os

        os.environ.setdefault("MLAIR_COMPOSE_FILE", args.compose_file)
    return run_doctor(profile=args.profile, config_path=args.config_path)


if __name__ == "__main__":
    sys.exit(main())
