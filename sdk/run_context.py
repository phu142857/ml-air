"""Run-scoped tracking context: env vars + optional resource monitor."""

from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator

from sdk.resource_monitor import ResourceMonitor, resource_monitor_enabled

_TRACKING_ENV_KEYS = (
    "ML_AIR_RUN_ID",
    "ML_AIR_TASK_ID",
    "ML_AIR_TENANT_ID",
    "ML_AIR_PROJECT_ID",
    "ML_AIR_BASE_URL",
    "ML_AIR_TOKEN",
)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _maybe_persist_worker_environment(ctx: "RunContext") -> None:
    if not ctx.run_id or not ctx.tenant_id or not ctx.project_id or not ctx.token:
        return
    try:
        import json
        import urllib.request

        from sdk.environment import collect_environment

        env = collect_environment(capturer="mlair-worker", include_pip_digest=False)
        base = (ctx.base_url or "http://localhost:8080").rstrip("/")
        url = (
            f"{base}/v1/tenants/{ctx.tenant_id}/projects/{ctx.project_id}"
            f"/runs/{ctx.run_id}/environment"
        )
        payload = json.dumps({"environment": env}).encode("utf-8")
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {ctx.token}"}
        req = urllib.request.Request(url, data=payload, method="PUT", headers=headers)
        with urllib.request.urlopen(req, timeout=10):  # noqa: S310
            pass
    except Exception:
        pass


def resolve_tracking_scope(
    *,
    run_id: str | None = None,
    task_id: str | None = None,
    tenant_id: str | None = None,
    project_id: str | None = None,
    base_url: str | None = None,
    token: str | None = None,
) -> dict[str, str]:
    """Merge explicit args with existing process env (explicit wins when non-empty)."""
    out: dict[str, str] = {}
    pairs = (
        ("ML_AIR_RUN_ID", run_id or _env("ML_AIR_RUN_ID")),
        ("ML_AIR_TASK_ID", task_id or _env("ML_AIR_TASK_ID")),
        ("ML_AIR_TENANT_ID", tenant_id or _env("ML_AIR_TENANT_ID", "default")),
        ("ML_AIR_PROJECT_ID", project_id or _env("ML_AIR_PROJECT_ID", "default_project")),
        ("ML_AIR_BASE_URL", base_url or _env("ML_AIR_BASE_URL") or _env("MLAIR_API_BASE_URL") or "http://localhost:8080"),
        ("ML_AIR_TOKEN", token or _env("ML_AIR_TOKEN") or _env("ML_AIR_TRACKING_TOKEN") or _env("MLAIR_WORKER_TOKEN")),
    )
    for key, val in pairs:
        if val:
            out[key] = val
    return out


@dataclass
class RunContext:
    """Active MLAir run scope for SDK tracking + resource telemetry."""

    run_id: str | None = None
    task_id: str | None = None
    tenant_id: str | None = None
    project_id: str | None = None
    base_url: str | None = None
    token: str | None = None
    _monitor: ResourceMonitor | None = field(default=None, repr=False)
    _prev_env: dict[str, str | None] = field(default_factory=dict, repr=False)

    def _apply_env(self, values: dict[str, str]) -> None:
        for key in _TRACKING_ENV_KEYS:
            if key not in values:
                continue
            self._prev_env[key] = os.environ.get(key)
            os.environ[key] = values[key]

    def _restore_env(self) -> None:
        for key, prev in self._prev_env.items():
            if prev is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = prev
        self._prev_env.clear()

    def complete_bundle(self) -> dict[str, Any]:
        """``resource_usage`` + ``usage_samples`` for worker ``complete`` / ``fail`` payloads."""
        if self._monitor is not None:
            return self._monitor.complete_bundle()
        return {"resource_usage": {}, "usage_samples": []}

    def summary(self) -> dict[str, Any]:
        if self._monitor is not None:
            return self._monitor.summary()
        return {}

    def usage_for_heartbeat(self) -> dict[str, Any] | None:
        if self._monitor is not None:
            return self._monitor.latest_heartbeat_usage()
        return None


@contextmanager
def start_run(
    *,
    run_id: str | None = None,
    task_id: str | None = None,
    tenant_id: str | None = None,
    project_id: str | None = None,
    base_url: str | None = None,
    token: str | None = None,
    monitor: bool | None = None,
    flush_interval_seconds: float | None = None,
) -> Iterator[RunContext]:
    """Enter MLAir tracking scope and optionally sample process-tree resources.

    Sets ``ML_AIR_RUN_ID`` (and related env) for ``log_metric`` / ``log_param`` / ``log_artifact``.
    When monitoring is enabled, wraps the block with :class:`ResourceMonitor` rooted at the current PID.

    Example (external worker)::

        with start_run(task_id=task_id, run_id=run_id) as run:
            train()
        post_task_complete(task_id, worker_id=wid, **run.complete_bundle())
    """
    scope = resolve_tracking_scope(
        run_id=run_id,
        task_id=task_id,
        tenant_id=tenant_id,
        project_id=project_id,
        base_url=base_url,
        token=token,
    )
    ctx = RunContext(
        run_id=scope.get("ML_AIR_RUN_ID"),
        task_id=scope.get("ML_AIR_TASK_ID"),
        tenant_id=scope.get("ML_AIR_TENANT_ID"),
        project_id=scope.get("ML_AIR_PROJECT_ID"),
        base_url=scope.get("ML_AIR_BASE_URL"),
        token=scope.get("ML_AIR_TOKEN"),
    )
    ctx._apply_env(scope)
    _maybe_persist_worker_environment(ctx)

    use_monitor = resource_monitor_enabled() if monitor is None else bool(monitor)
    if use_monitor:
        flush = flush_interval_seconds
        if flush is None and not ctx.task_id:
            flush = 0.0
        ctx._monitor = ResourceMonitor(
            task_id=ctx.task_id,
            flush_interval_seconds=flush,
        )
        ctx._monitor.__enter__()

    try:
        yield ctx
    finally:
        if ctx._monitor is not None:
            ctx._monitor.__exit__(None, None, None)
        ctx._restore_env()
