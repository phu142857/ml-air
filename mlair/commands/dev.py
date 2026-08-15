"""``mlair dev`` — local development utilities (compose helpers)."""

from __future__ import annotations

from mlair.commands.serve import _compose, _prepare


def run_dev_shell(*, profile: str | None = None, config_path: str | None = None) -> int:
    prep = _prepare(profile, config_path)
    if prep is None:
        return 1
    compose_path, _cfg = prep
    service = "api"
    return _compose(compose_path, "exec", service, "/bin/sh")


def run_dev_logs(
    *,
    follow: bool = True,
    service: str | None = None,
    profile: str | None = None,
    config_path: str | None = None,
) -> int:
    prep = _prepare(profile, config_path)
    if prep is None:
        return 1
    compose_path, _cfg = prep
    args = ["logs"]
    if follow:
        args.append("-f")
    if service:
        args.append(service)
    return _compose(compose_path, *args)


def run_dev_ps(*, profile: str | None = None, config_path: str | None = None) -> int:
    prep = _prepare(profile, config_path)
    if prep is None:
        return 1
    compose_path, _cfg = prep
    return _compose(compose_path, "ps")
