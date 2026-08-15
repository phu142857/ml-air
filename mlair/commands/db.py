"""``mlair db backup`` / ``mlair db restore`` — PostgreSQL backup utilities."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from mlair.commands.serve import _prepare
from mlair.compose_cli import compose_argv


def _postgres_service(compose_path: Path) -> list[str]:
    return compose_argv(compose_path, "exec", "-T", "postgres")


def run_db_backup(
    *,
    output_dir: str | None = None,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    prep = _prepare(profile, config_path)
    if prep is None:
        return 1
    compose_path, _cfg = prep
    backup_dir = Path(output_dir or os.getenv("MLAIR_BACKUP_DIR", "backups/postgres"))
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    outfile = backup_dir / f"mlair_{stamp}.dump"
    cmd = _postgres_service(compose_path) + [
        "pg_dump",
        "-U",
        os.getenv("POSTGRES_USER", "mlair"),
        "-d",
        os.getenv("POSTGRES_DB", "mlair"),
        "-Fc",
    ]
    print(f"[mlair] writing backup to {outfile}")
    with outfile.open("wb") as fh:
        proc = subprocess.run(cmd, stdout=fh, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        print(f"[FAIL] pg_dump failed: {err}", file=sys.stderr)
        return proc.returncode
    print(f"[OK] backup created: {outfile}")
    return 0


def run_db_restore(
    *,
    backup_file: str,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    path = Path(backup_file)
    if not path.is_file():
        print(f"[FAIL] backup file not found: {path}", file=sys.stderr)
        return 1
    prep = _prepare(profile, config_path)
    if prep is None:
        return 1
    compose_path, _cfg = prep
    cmd = _postgres_service(compose_path) + [
        "pg_restore",
        "-U",
        os.getenv("POSTGRES_USER", "mlair"),
        "-d",
        os.getenv("POSTGRES_DB", "mlair"),
        "--clean",
        "--if-exists",
    ]
    print(f"[mlair] restoring from {path}")
    with path.open("rb") as fh:
        proc = subprocess.run(cmd, stdin=fh, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        print(f"[FAIL] pg_restore failed: {err}", file=sys.stderr)
        return proc.returncode
    print(f"[OK] restore completed from {path}")
    return 0
