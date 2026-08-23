"""P2 evaluation harness: API/admission latency, scheduler TPS, queue, crash RTO, attribution."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
_ROOT = _SCRIPTS.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from identity_smoke_token import resolve_smoke_bearer_token  # noqa: E402
from mlair_eval.client import EvalClient, TimedCall  # noqa: E402
from mlair_eval.stats import (  # noqa: E402
    parse_prom_counter,
    parse_vmrss_mb,
    relative_error,
    submit_cells_for_profile,
    summarize_latencies,
)
from smoke_common import require_api_reachable  # noqa: E402

PIPELINE_ID = "eval_echo_pipeline"
EVAL_TASK = "echo"
CONTAINER = os.getenv("MLAIR_CONTAINER_NAME", "mlair")
SUPERVISOR_CFG = "/etc/supervisor/conf.d/mlair.conf"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scope_path(tenant: str, project: str, suffix: str) -> str:
    return f"/v1/tenants/{tenant}/projects/{project}{suffix}"


def _container_cli() -> str | None:
    for name in ("docker", "podman"):
        if shutil.which(name):
            return name
    return None


def _container_exec(args: list[str], timeout: float = 20.0) -> tuple[int, str, str]:
    cli = _container_cli()
    if not cli:
        return 1, "", "no docker/podman"
    cmd = [cli, "exec", CONTAINER, *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (subprocess.TimeoutExpired, OSError) as exc:
        return 1, "", str(exc)
    return int(proc.returncode), proc.stdout or "", proc.stderr or ""


def wave(n: int, concurrency: int, fn) -> list[Any]:
    if n <= 0:
        return []
    workers = max(1, min(int(concurrency), n))
    out: list[Any] = [None] * n
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(fn, i): i for i in range(n)}
        for fut in as_completed(futs):
            out[futs[fut]] = fut.result()
    return out


class Harness:
    def __init__(self, client: EvalClient, *, tenant: str, project: str, timeout_s: int) -> None:
        self.client = client
        self.tenant = tenant
        self.project = project
        self.timeout_s = timeout_s
        self._scopes: dict[tuple[str, str], dict[str, str]] = {}

    def path(self, suffix: str, tenant: str | None = None, project: str | None = None) -> str:
        return _scope_path(tenant or self.tenant, project or self.project, suffix)

    def execution_mode(self) -> str:
        call = self.client.request(
            "POST",
            "/v1/tasks/lease",
            {"worker_id": "eval-probe", "capabilities": ["echo_tracking"], "max_tasks": 1},
        )
        if call.status_code == 200:
            return str(call.body.get("execution_mode") or "internal")
        return "internal"

    def ensure_scope(self, tenant: str, project: str) -> dict[str, str]:
        key = (tenant, project)
        if key in self._scopes:
            return self._scopes[key]
        if tenant != self.tenant or project != self.project:
            reg = self.client.request(
                "POST",
                f"/v1/tenants/{tenant}/projects/registry",
                {"project_id": project, "name": f"eval {project}"},
            )
            if reg.status_code not in {200, 201} and "exists" not in str(reg.body).lower():
                raise RuntimeError(f"register {tenant}/{project}: {reg.status_code} {reg.body}")
        ds_name = "eval_harness_ds"
        listed = self.client.request("GET", self.path("/datasets?limit=100", tenant, project))
        version_id = ""
        if listed.ok:
            for item in listed.body.get("items") or []:
                if str(item.get("name") or "") != ds_name:
                    continue
                dataset_id = str(item.get("dataset_id") or item.get("id") or "")
                vers = self.client.request("GET", self.path(f"/datasets/{dataset_id}/versions", tenant, project))
                items = vers.body.get("items") or [] if vers.ok else []
                if items:
                    version_id = str(items[0].get("version_id") or items[0].get("id") or "")
                    break
        if not version_id:
            csv_body = ("id,value\n" + "\n".join(f"{i},{i}" for i in range(8)) + "\n").encode("utf-8")
            up = self.client.multipart_upload(
                self.path("/datasets/upload", tenant, project),
                {"dataset_name": ds_name},
                csv_body,
            )
            version_id = str(up.body.get("version_id") or "").strip()
            if not up.ok or not version_id:
                raise RuntimeError(f"upload dataset {tenant}/{project}: {up.status_code} {up.body}")
        existing = self.client.request("GET", self.path(f"/pipelines/{PIPELINE_ID}/versions", tenant, project))
        has_pipeline = bool(existing.ok and (existing.body.get("items") or []))
        if not has_pipeline:
            ver = self.client.request(
                "POST",
                self.path(f"/pipelines/{PIPELINE_ID}/versions", tenant, project),
                {
                    "config": {
                        "tasks": [{"id": EVAL_TASK, "plugin": "echo_tracking"}],
                        "inputs": [{"dataset": ds_name, "required_size": 1}],
                    }
                },
            )
            if not ver.ok:
                raise RuntimeError(f"pipeline version {tenant}/{project}: {ver.status_code} {ver.body}")
        row = {"tenant": tenant, "project": project, "dataset_version_id": version_id}
        self._scopes[key] = row
        return row

    def tenants_for(self, n: int) -> list[tuple[str, str]]:
        if n <= 1:
            return [(self.tenant, self.project)]
        out: list[tuple[str, str]] = []
        for i in range(n):
            out.append((f"eval_t{i:02d}", "eval_project"))
        return out

    def post_explain(self, scope: dict[str, str], resources: dict[str, Any] | None = None, *, gated: bool = False) -> TimedCall:
        body: dict[str, Any] = {}
        if gated:
            body["pipeline_id"] = PIPELINE_ID
            body["dataset_version_id"] = scope["dataset_version_id"]
        if resources:
            body["resources"] = resources
        return self.client.request("POST", self.path("/admission/explain", scope["tenant"], scope["project"]), body)

    def post_run(self, scope: dict[str, str], tag: str, resources: dict[str, Any] | None = None) -> TimedCall:
        override: dict[str, Any] = {}
        if resources:
            override["resources"] = resources
        body: dict[str, Any] = {
            "pipeline_id": PIPELINE_ID,
            "idempotency_key": f"eval-{tag}-{uuid.uuid4().hex[:12]}",
            "plugin_name": "echo_tracking",
            "dataset_version_id": scope["dataset_version_id"],
            "use_latest_pipeline_version": True,
            "override_config": override,
        }
        return self.client.request("POST", self.path("/runs", scope["tenant"], scope["project"]), body)

    def get_run(self, scope: dict[str, str], run_id: str) -> TimedCall:
        return self.client.request("GET", self.path(f"/runs/{run_id}", scope["tenant"], scope["project"]))

    def get_tasks(self, scope: dict[str, str], run_id: str) -> list[dict[str, Any]]:
        call = self.client.request("GET", self.path(f"/runs/{run_id}/tasks", scope["tenant"], scope["project"]))
        items = call.body.get("items") if call.ok else None
        return items if isinstance(items, list) else []

    def wait_task_started(self, scope: dict[str, str], run_id: str, *, timeout_s: int | None = None) -> dict[str, Any] | None:
        deadline = time.time() + (timeout_s or self.timeout_s)
        while time.time() < deadline:
            for task in self.get_tasks(scope, run_id):
                if task.get("started_at") or str(task.get("status") or "").upper() in {"RUNNING", "SUCCESS", "FAILED"}:
                    return task
            time.sleep(0.25)
        return None

    def wait_terminal(self, scope: dict[str, str], run_id: str, *, timeout_s: int | None = None) -> str:
        deadline = time.time() + (timeout_s or self.timeout_s)
        while time.time() < deadline:
            call = self.get_run(scope, run_id)
            status = str(call.body.get("status") or "").upper() if call.ok else ""
            if status in {"SUCCESS", "FAILED", "CANCELLED"}:
                return status
            time.sleep(0.4)
        return "TIMEOUT"


def bench_api(h: Harness, samples: int, concurrency: int) -> dict[str, Any]:
    scope = h.ensure_scope(h.tenant, h.project)
    run = h.post_run(scope, "api-probe")
    run_id = str(run.body.get("run_id") or "")
    if run.status_code not in {200, 202} or not run_id:
        # DEFER 202 still has admission_id; GET /runs/{id} needs a real run.
        run_id = ""

    def one(i: int) -> dict[str, TimedCall]:
        health = h.client.request("GET", "/health")
        stats = h.client.request("GET", h.path("/admission/stats"))
        get_run = h.get_run(scope, run_id) if run_id else TimedCall(0.0, 0, {}, False)
        return {"health": health, "stats": stats, "get_run": get_run}

    rows = wave(samples, concurrency, one)
    by_name = {"health": [], "stats": [], "get_run": []}
    for row in rows:
        for name, call in row.items():
            if name == "get_run" and not run_id:
                continue
            if call.status_code:
                by_name[name].append(call.latency_ms)
    return {
        "concurrency": concurrency,
        "probe_run_id": run_id or None,
        "probe_http": run.status_code,
        "endpoints": {name: summarize_latencies(vals) for name, vals in by_name.items() if vals},
    }


def bench_admission(h: Harness, samples: int, concurrency: int) -> dict[str, Any]:
    """Timed POST .../admission/explain on ResourceState only.

    Gated pipeline/training-policy explain is a different mix (often REJECT when
    no training policy is bound). Resource-only isolates ACCEPT vs RESOURCE_CAPACITY.
    """
    scope = h.ensure_scope(h.tenant, h.project)

    def one(i: int) -> dict[str, TimedCall]:
        accept = h.post_explain(scope, {"cpu": 0.1, "memory_mb": 32, "gpu": 0})
        reject = h.post_explain(scope, {"cpu": 1, "memory_mb": 32, "gpu": 1})
        return {"accept": accept, "reject": reject}

    rows = wave(samples, concurrency, one)
    groups: dict[str, list[float]] = {"accept": [], "reject": []}
    decisions: dict[str, int] = {}
    for row in rows:
        for name, call in row.items():
            groups[name].append(call.latency_ms)
            decision = str(call.body.get("decision") or call.status_code)
            decisions[f"{name}:{decision}"] = decisions.get(f"{name}:{decision}", 0) + 1
    return {
        "concurrency": concurrency,
        "decisions": decisions,
        "latency_ms": {name: summarize_latencies(vals) for name, vals in groups.items()},
    }


def _round_robin_scopes(h: Harness, tenants: int, n: int) -> list[dict[str, str]]:
    pairs = h.tenants_for(tenants)
    scopes = [h.ensure_scope(t, p) for t, p in pairs]
    return [scopes[i % len(scopes)] for i in range(n)]


def bench_submit(h: Harness, tenants: int, tasks: int, concurrency: int) -> dict[str, Any]:
    scopes = _round_robin_scopes(h, tenants, tasks)
    t0 = time.perf_counter()
    http_ms: list[float] = []
    codes: dict[str, int] = {}
    accepted: list[tuple[dict[str, str], str, float]] = []

    def one(i: int) -> tuple[TimedCall, float]:
        call = h.post_run(scopes[i], f"t{tenants}-n{tasks}-c{concurrency}-{i}")
        return call, time.perf_counter()

    pairs = wave(tasks, concurrency, one)
    submit_elapsed = time.perf_counter() - t0
    for i, (call, posted_at) in enumerate(pairs):
        http_ms.append(call.latency_ms)
        codes[str(call.status_code)] = codes.get(str(call.status_code), 0) + 1
        run_id = str(call.body.get("run_id") or "")
        if call.status_code == 200 and run_id:
            accepted.append((scopes[i], run_id, posted_at))

    queue_ms: list[float] = []
    started = 0
    for scope, run_id, posted_at in accepted:
        task = h.wait_task_started(scope, run_id)
        if task and (task.get("started_at") or str(task.get("status") or "").upper() in {"RUNNING", "SUCCESS"}):
            started += 1
            queue_ms.append((time.perf_counter() - posted_at) * 1000.0)
    drain_elapsed = time.perf_counter() - t0
    tps = started / drain_elapsed if drain_elapsed > 0 else 0.0
    submit_tps = len(accepted) / submit_elapsed if submit_elapsed > 0 else 0.0
    return {
        "tenants": tenants,
        "tasks": tasks,
        "concurrency": concurrency,
        "http": summarize_latencies(http_ms),
        "status_codes": codes,
        "accepted_runs": len(accepted),
        "tasks_started": started,
        "submit_elapsed_s": round(submit_elapsed, 4),
        "drain_elapsed_s": round(drain_elapsed, 4),
        "submit_runs_per_sec": round(submit_tps, 4),
        "scheduler_tasks_per_sec": round(tps, 4),
        "queue_latency_ms": summarize_latencies(queue_ms),
    }


def bench_crash(h: Harness) -> dict[str, Any]:
    mode = h.execution_mode()
    scope = h.ensure_scope(h.tenant, h.project)
    if mode == "external":
        return _crash_external_lease(h, scope)
    return _crash_internal_executor(h, scope)


def _crash_internal_executor(h: Harness, scope: dict[str, str]) -> dict[str, Any]:
    if not _container_cli():
        return {"skipped": True, "reason": "docker/podman not available", "mode": "internal"}
    code, stdout, stderr = _container_exec(["supervisorctl", "-c", SUPERVISOR_CFG, "status", "executor"])
    status = stdout or stderr
    if code != 0 and "executor" not in status:
        return {"skipped": True, "reason": status.strip() or "executor not supervised", "mode": "internal"}
    t0 = time.perf_counter()
    _container_exec(["supervisorctl", "-c", SUPERVISOR_CFG, "stop", "executor"])
    _container_exec(["supervisorctl", "-c", SUPERVISOR_CFG, "start", "executor"])
    recovered = False
    deadline = time.time() + max(30, h.timeout_s)
    while time.time() < deadline:
        _c, out, err = _container_exec(["supervisorctl", "-c", SUPERVISOR_CFG, "status", "executor"])
        if "RUNNING" in out or "RUNNING" in err:
            recovered = True
            break
        time.sleep(0.2)
    executor_ms = (time.perf_counter() - t0) * 1000.0
    run = h.post_run(scope, "crash-rto")
    run_id = str(run.body.get("run_id") or "")
    task = h.wait_task_started(scope, run_id) if run.status_code == 200 and run_id else None
    rto_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "mode": "internal",
        "executor_restart_ms": round(executor_ms, 3),
        "executor_running": recovered,
        "post_crash_run_id": run_id or None,
        "post_crash_task_started": bool(task),
        "rto_ms": round(rto_ms, 3) if task else None,
        "definition": "SIG stop/start internal executor via supervisorctl, then first new task started_at",
    }


def _crash_external_lease(h: Harness, scope: dict[str, str]) -> dict[str, Any]:
    run = h.post_run(scope, "crash-lease")
    run_id = str(run.body.get("run_id") or "")
    if run.status_code != 200 or not run_id:
        return {"skipped": True, "reason": f"could not create run: {run.status_code}", "mode": "external"}
    worker_id = f"eval-crash-{uuid.uuid4().hex[:8]}"
    leased = False
    deadline = time.time() + h.timeout_s
    while time.time() < deadline and not leased:
        call = h.client.request(
            "POST",
            "/v1/tasks/lease",
            {"worker_id": worker_id, "capabilities": ["echo_tracking"], "max_tasks": 1},
        )
        tasks = call.body.get("tasks") if call.ok else None
        if isinstance(tasks, list) and tasks:
            leased = True
            break
        time.sleep(0.4)
    if not leased:
        return {"skipped": True, "reason": "no task leased", "mode": "external", "run_id": run_id}
    t0 = time.perf_counter()
    recovered = False
    while time.time() < t0 + max(h.timeout_s, 130):
        tasks = h.get_tasks(scope, run_id)
        statuses = {str(t.get("status") or "").upper() for t in tasks}
        if "PENDING" in statuses or (statuses and statuses.isdisjoint({"RUNNING"})):
            if any(str(t.get("status") or "").upper() == "PENDING" for t in tasks):
                recovered = True
                break
        time.sleep(0.5)
    rto_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "mode": "external",
        "run_id": run_id,
        "recovered_to_pending": recovered,
        "rto_ms": round(rto_ms, 3) if recovered else None,
        "definition": "lease a task then drop heartbeats until scheduler reaper sets PENDING",
    }


def bench_attribution(h: Harness) -> dict[str, Any]:
    scope = h.ensure_scope(h.tenant, h.project)
    run = h.post_run(scope, "attr")
    run_id = str(run.body.get("run_id") or "")
    if run.status_code != 200 or not run_id:
        return {"skipped": True, "reason": f"create run failed: {run.status_code} {run.body}"}
    task_id = ""
    usage_call = None
    ground_mb = None
    observed_mb = None
    identity: dict[str, Any] = {}
    gt_error = None
    deadline = time.time() + min(20, h.timeout_s)
    while time.time() < deadline:
        if not task_id:
            tasks = h.get_tasks(scope, run_id)
            if tasks:
                task_id = str(tasks[0].get("task_id") or "")
            if not task_id:
                time.sleep(0.05)
                continue
        usage_call = h.client.request("GET", h.path(f"/tasks/{task_id}/usage", scope["tenant"], scope["project"]))
        if not usage_call.ok:
            time.sleep(0.05)
            continue
        identity = usage_call.body.get("resource_identity") or {}
        observed = usage_call.body.get("observed_usage") or usage_call.body.get("usage") or {}
        if isinstance(observed, dict):
            observed_mb = observed.get("memory_mb_peak")
            if observed_mb is None:
                observed_mb = observed.get("memory_mb")
        pid = identity.get("pid") if isinstance(identity, dict) else None
        if pid and _container_cli() and ground_mb is None:
            code, text, err = _container_exec(["cat", f"/proc/{int(pid)}/status"])
            ground_mb = parse_vmrss_mb(text)
            if ground_mb is None:
                noise = "\n".join(
                    ln
                    for ln in (err or text or "").splitlines()
                    if "Emulate Docker CLI" not in ln and "nodocker" not in ln
                ).strip()
                gt_error = (noise or f"exit {code}").strip()[:240]
                if "No such file" in (err or text or ""):
                    break
        if observed_mb is not None and (ground_mb is not None or not pid):
            break
        time.sleep(0.05)
    if not task_id:
        return {"skipped": True, "reason": "task did not start", "run_id": run_id}
    terminal = h.wait_terminal(scope, run_id, timeout_s=min(60, h.timeout_s))
    final = h.client.request("GET", h.path(f"/tasks/{task_id}/usage", scope["tenant"], scope["project"]))
    body = final.body if final.ok else (usage_call.body if usage_call else {})
    obs = body.get("observed_usage") or {}
    if isinstance(obs, dict) and obs.get("memory_mb_peak") is not None:
        observed_mb = obs.get("memory_mb_peak")
    err = relative_error(float(observed_mb) if observed_mb is not None else None, ground_mb)
    return {
        "run_id": run_id,
        "task_id": task_id,
        "terminal": terminal,
        "attribution_source": body.get("attribution_source"),
        "telemetry_trust": body.get("telemetry_trust"),
        "trust_reason": body.get("trust_reason"),
        "observed_memory_mb": observed_mb,
        "ground_truth_vmrss_mb": round(ground_mb, 4) if ground_mb is not None else None,
        "memory_relative_error": round(err, 4) if err is not None else None,
        "ground_truth_error": gt_error,
        "resource_identity": identity or body.get("resource_identity"),
        "ground_truth": "container /proc/<pid>/status VmRSS sampled by the harness, not worker telemetry",
    }


def scrape_scheduler_metrics(metrics_url: str) -> dict[str, float | None]:
    text = ""
    if metrics_url:
        import urllib.request

        try:
            with urllib.request.urlopen(metrics_url, timeout=2) as resp:
                text = resp.read().decode("utf-8", errors="replace")
        except OSError:
            text = ""
    if not text:
        _c, stdout, _err = _container_exec(["curl", "-fsS", "http://127.0.0.1:9102/metrics"], timeout=5)
        text = stdout
    if not text.strip():
        return {}
    return {
        "mlair_scheduler_run_scheduled_total": parse_prom_counter(text, "mlair_scheduler_run_scheduled_total"),
        "mlair_scheduler_task_completed_total": parse_prom_counter(text, "mlair_scheduler_task_completed_total"),
    }


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="MLair P2 evaluation harness")
    p.add_argument("--profile", choices=("smoke", "publish"), default="smoke")
    p.add_argument(
        "--only",
        default="api,admission,submit,attribution",
        help="Comma list: api,admission,submit,crash,attribution",
    )
    p.add_argument("--base-url", default=os.getenv("ML_AIR_BASE_URL", "http://localhost:8080"))
    p.add_argument("--tenant", default=os.getenv("ML_AIR_TENANT_ID", "default"))
    p.add_argument("--project", default=os.getenv("ML_AIR_PROJECT_ID", "default_project"))
    p.add_argument("--timeout", type=int, default=int(os.getenv("ML_AIR_EVAL_TIMEOUT", "90")))
    p.add_argument("--api-samples", type=int, default=0, help="0 = profile default")
    p.add_argument("--metrics-url", default=os.getenv("ML_AIR_SCHEDULER_METRICS_URL", "http://localhost:9102/metrics"))
    p.add_argument("--out", default="", help="Write JSON report to this path")
    p.add_argument("--crash", action="store_true", help="Include worker-crash RTO (on for publish)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    base = str(args.base_url).rstrip("/")
    os.environ["ML_AIR_BASE_URL"] = base
    require_api_reachable(base)
    token = resolve_smoke_bearer_token("maintainer")
    client = EvalClient(base, token)
    h = Harness(client, tenant=args.tenant, project=args.project, timeout_s=args.timeout)
    wanted = {part.strip() for part in str(args.only).split(",") if part.strip()}
    if args.profile == "publish" or args.crash:
        wanted.add("crash")
    api_samples = args.api_samples or (200 if args.profile == "publish" else 30)
    report: dict[str, Any] = {
        "started_at": _now(),
        "profile": args.profile,
        "base_url": base,
        "tenant": args.tenant,
        "project": args.project,
        "execution_mode": h.execution_mode(),
        "note": "RSS 7.9× is not claimed here; P3 is same-machine Airflow+MLflow.",
    }
    if "api" in wanted:
        print("[eval] API latency")
        report["api"] = {
            "concurrency_1": bench_api(h, api_samples, 1),
            "concurrency_sweep": [
                bench_api(h, max(8, api_samples // 2), c)
                for c in ((1, 10, 100) if args.profile == "publish" else (1, 4))
            ],
        }
    if "admission" in wanted:
        print("[eval] admission latency")
        report["admission"] = {
            "concurrency_sweep": [
                bench_admission(h, max(8, api_samples // 2), c)
                for c in ((1, 10, 100) if args.profile == "publish" else (1, 4))
            ]
        }
    if "submit" in wanted:
        print("[eval] submit / scheduler / queue")
        cells = []
        for tenants, tasks, conc in submit_cells_for_profile(args.profile):
            print(f"[eval]   tenants={tenants} tasks={tasks} concurrency={conc}")
            cells.append(bench_submit(h, tenants, tasks, conc))
        report["submit"] = cells
        report["scheduler_metrics"] = scrape_scheduler_metrics(args.metrics_url)
    if "crash" in wanted:
        print("[eval] worker-crash RTO")
        report["crash"] = bench_crash(h)
    if "attribution" in wanted:
        print("[eval] observed vs ground truth")
        report["attribution"] = bench_attribution(h)
    report["finished_at"] = _now()
    text = json.dumps(report, indent=2, sort_keys=False)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"[eval] wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
