import json
import logging
import os
import random
import subprocess
import time
import resource
import urllib.error
import urllib.request
import hashlib
import hmac
import base64
from functools import lru_cache
from datetime import datetime, timezone
from typing import Any

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from redis import Redis

from sdk.mlair_tokens import resolve_platform_api_token
from sdk.mlair_token_manager import get_platform_token_manager

try:
    from app.settings.worker import manifest_strict_key_lifecycle
except ImportError:
    manifest_strict_key_lifecycle = None  # type: ignore[assignment]

logging.basicConfig(
    level=os.getenv("ML_AIR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("mlair.executor")

TASK_EXECUTED_TOTAL = Counter(
    "mlair_executor_task_executed_total",
    "Number of tasks executed by executor",
    ["status", "queue"],
)
TASK_DURATION_SECONDS = Histogram(
    "mlair_executor_task_duration_seconds",
    "Executor task runtime in seconds",
    ["pipeline_id"],
)
TASK_USAGE_MISSING_TOTAL = Counter(
    "mlair_executor_task_usage_missing_total",
    "Tasks finished without resource usage when monitor enabled",
    ["pipeline_id", "status"],
)
QUEUE_INFLIGHT = Gauge(
    "mlair_executor_queue_inflight",
    "Current executor inflight tasks by queue",
    ["queue"],
)
MANIFEST_POST_TOTAL = Counter(
    "mlair_executor_manifest_post_total",
    "Manifest post attempts by result",
    ["result", "algorithm"],
)


def _redis() -> Redis:
    url = os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")
    return Redis.from_url(url, decode_responses=True)


from executor.plugin_context import build_plugin_execution_context


def _run_plugin_subprocess(
    plugin_name: str,
    context: dict,
    monitor: Any | None = None,
    observer: Any | None = None,
) -> dict:
    timeout_seconds = int(os.getenv("ML_AIR_PLUGIN_TIMEOUT_SECONDS", "120"))
    runner_module = os.getenv("ML_AIR_PLUGIN_RUNNER_MODULE", "mlair_runner")
    from otel_bootstrap import otel_subprocess_env

    child_env = {**os.environ, **otel_subprocess_env()}
    get_platform_token_manager().sync_process_env(child_env)
    try:
        proc = subprocess.Popen(
            ["python", "-m", runner_module, plugin_name],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=child_env,
        )
    except OSError as exc:
        return {"ok": False, "error": f"spawn_failed: {exc}"}

    if monitor is not None:
        monitor.start(proc.pid)
    if observer is not None:
        observer.start(proc.pid)

    try:
        stdout, stderr = proc.communicate(input=json.dumps(context), timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        return {"ok": False, "error": f"timeout_after_{timeout_seconds}s"}
    if proc.returncode != 0:
        return {
            "ok": False,
            "error": f"exit_code={proc.returncode}",
            "stderr": (stderr or "").strip(),
            "stdout": (stdout or "").strip(),
        }
    try:
        parsed = json.loads(stdout or "{}")
        return {"ok": True, "result": parsed, "stderr": (stderr or "").strip()}
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid_json_output: {exc}", "stdout": (stdout or "").strip()}


def _api_token(*, force_refresh: bool = False) -> str:
    token = resolve_platform_api_token() if not force_refresh else get_platform_token_manager().get_access_token(force_refresh=True)
    if not force_refresh and not token:
        token = get_platform_token_manager().get_access_token(force_refresh=False)
    if not token:
        raise RuntimeError(
            "ML_AIR_SA_EXECUTOR_SECRET, ML_AIR_REFRESH_TOKEN, or ML_AIR_AUTH_USERNAME/PASSWORD is required"
        )
    return token


def _is_http_401(exc: BaseException) -> bool:
    if isinstance(exc, urllib.error.HTTPError) and exc.code == 401:
        return True
    if isinstance(exc, urllib.error.HTTPError):
        return False
    message = str(exc).lower()
    return "401" in message and "unauthorized" in message


def _urllib_request_with_auth_retry(req: urllib.request.Request, *, timeout: float) -> None:
    token = _api_token()
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout):
            return
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise
        refreshed = get_platform_token_manager().on_http_401()
        if not refreshed:
            raise
        retry = urllib.request.Request(
            req.full_url,
            data=req.data,
            headers={k: v for k, v in req.header_items() if k.lower() != "authorization"},
            method=req.get_method(),
        )
        retry.add_header("Authorization", f"Bearer {refreshed}")
        with urllib.request.urlopen(retry, timeout=timeout):
            return


def _tracking_post(path: str, payload: dict) -> None:
    base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    req = urllib.request.Request(
        url=f"{base}{path}",
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        _urllib_request_with_auth_retry(req, timeout=5)
    except urllib.error.URLError as exc:
        logger.warning("tracking_post_failed path=%s err=%s", path, exc)


def _api_post(path: str, payload: dict, timeout: int = 10) -> bool:
    base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    req = urllib.request.Request(
        url=f"{base}{path}",
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        _urllib_request_with_auth_retry(req, timeout=timeout)
        return True
    except urllib.error.URLError as exc:
        logger.warning("api_post_failed path=%s err=%s", path, exc)
        return False


def _canonical_json(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


@lru_cache(maxsize=1)
def _managed_keys_blob() -> dict:
    provider = os.getenv("ML_AIR_MANIFEST_KEY_PROVIDER", "env").strip().lower()
    if provider != "file":
        return {}
    path = os.getenv("ML_AIR_MANIFEST_MANAGED_KEYS_FILE", "").strip()
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            parsed = json.load(f)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _strict_key_lifecycle() -> bool:
    if manifest_strict_key_lifecycle is not None:
        return manifest_strict_key_lifecycle()
    return os.getenv("ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE", "1") == "1"


def _allowed_key_ids() -> set[str]:
    managed = _managed_keys_blob().get("allowed_key_ids")
    if isinstance(managed, list):
        return {str(x).strip() for x in managed if str(x).strip()}
    raw = os.getenv("ML_AIR_MANIFEST_ALLOWED_KEY_IDS", "").strip()
    if not raw:
        return set()
    return {x.strip() for x in raw.split(",") if x.strip()}


def _managed_keyset(kind: str) -> dict[str, str]:
    blob = _managed_keys_blob()
    raw = blob.get(kind)
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        ks = str(k).strip()
        vs = str(v).strip()
        if vs.startswith("env:"):
            env_name = vs[4:].strip()
            vs = os.getenv(env_name, "").strip()
        if ks and vs:
            out[ks] = vs
    return out


def _manifest_keys() -> tuple[str, dict[str, str]]:
    managed_active = str(_managed_keys_blob().get("active_key_id", "")).strip()
    active = managed_active or os.getenv("ML_AIR_MANIFEST_ACTIVE_KEY_ID", "v1").strip() or "v1"
    single = os.getenv("ML_AIR_MANIFEST_SIGNING_KEY", "mlair-dev-manifest-signing-key")
    managed_hmac = _managed_keyset("hmac_keys")
    if managed_hmac:
        if _strict_key_lifecycle() and active not in managed_hmac:
            raise RuntimeError("strict_key_lifecycle_active_kid_missing")
        return active, managed_hmac
    raw = os.getenv("ML_AIR_MANIFEST_SIGNING_KEYS_JSON", "").strip()
    if not raw:
        if _strict_key_lifecycle():
            raise RuntimeError("strict_key_lifecycle_hmac_keyset_missing")
        return active, {active: single}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return active, {active: single}
    if not isinstance(parsed, dict):
        return active, {active: single}
    keyset: dict[str, str] = {}
    for k, v in parsed.items():
        ks = str(k).strip()
        vs = str(v).strip()
        if ks and vs:
            keyset[ks] = vs
    if active not in keyset and not _strict_key_lifecycle():
        keyset[active] = single
    if _strict_key_lifecycle() and active not in keyset:
        raise RuntimeError("strict_key_lifecycle_active_kid_missing")
    return active, keyset


def _manifest_algorithm() -> str:
    alg = os.getenv("ML_AIR_MANIFEST_SIGNING_ALGORITHM", "hmac-sha256").strip().lower()
    if alg in {"hmac-sha256", "ed25519"}:
        return alg
    return "hmac-sha256"


def _manifest_private_key_for_kid(key_id: str) -> str | None:
    managed_ed = _managed_keyset("ed25519_private_keys")
    if managed_ed:
        v = managed_ed.get(key_id, "").strip()
        return v.replace("\\n", "\n") or None
    raw = os.getenv("ML_AIR_MANIFEST_ED25519_PRIVATE_KEYS_JSON", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {}
        if isinstance(parsed, dict):
            v = parsed.get(key_id)
            if v:
                s = str(v).strip().replace("\\n", "\n")
                if s:
                    return s
    single = os.getenv("ML_AIR_MANIFEST_ED25519_PRIVATE_KEY", "").strip().replace("\\n", "\n")
    return single or None


def _build_manifest_payload(task: dict, plugin_result: dict | None, status: str) -> dict:
    result = plugin_result.get("result") if isinstance(plugin_result, dict) else {}
    artifacts = result.get("artifacts") if isinstance(result, dict) else []
    lineage = result.get("lineage") if isinstance(result, dict) else {}
    return {
        "run_id": task.get("run_id"),
        "task_id": task.get("task_id"),
        "status": status,
        "pipeline_id": task.get("pipeline_id"),
        "attempt": int(task.get("attempt", 1)),
        "artifacts": artifacts if isinstance(artifacts, list) else [],
        "lineage": lineage if isinstance(lineage, dict) else {},
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }


def _sign_manifest(payload: dict) -> tuple[str, str, str]:
    algo = _manifest_algorithm()
    active_kid, keyset = _manifest_keys()
    msg = _canonical_json(payload).encode("utf-8")
    allowed = _allowed_key_ids()
    if allowed and active_kid not in allowed:
        raise RuntimeError(f"key_id_not_allowed:{active_kid}")
    if algo == "ed25519":
        key_pem = _manifest_private_key_for_kid(active_kid)
        if not key_pem:
            raise RuntimeError("missing_ed25519_private_key")
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

            private_key = serialization.load_pem_private_key(key_pem.encode("utf-8"), password=None)
            if not isinstance(private_key, Ed25519PrivateKey):
                raise RuntimeError("invalid_ed25519_private_key_type")
            raw_sig = private_key.sign(msg)
            sig = base64.b64encode(raw_sig).decode("ascii")
            return algo, active_kid, sig
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"ed25519_sign_failed:{exc}") from exc
    key = keyset.get(active_kid)
    if not key and not _strict_key_lifecycle():
        key = os.getenv("ML_AIR_MANIFEST_SIGNING_KEY", "mlair-dev-manifest-signing-key")
    if not key:
        raise RuntimeError(f"missing_hmac_key_for_kid:{active_kid}")
    sig = hmac.new(key.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return "hmac-sha256", active_kid, sig


def _post_manifest(task: dict, plugin_result: dict | None, status: str) -> None:
    run_id = task.get("run_id")
    task_id = task.get("task_id")
    if not run_id or not task_id:
        return
    tenant_id = task.get("tenant_id", "default")
    project_id = task.get("project_id", "default_project")
    payload = _build_manifest_payload(task=task, plugin_result=plugin_result, status=status)
    try:
        algorithm, key_id, signature = _sign_manifest(payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("manifest_sign_failed err=%s", exc)
        alg = _manifest_algorithm()
        MANIFEST_POST_TOTAL.labels(result="sign_failed", algorithm=alg).inc()
        return
    ok = _api_post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/tasks/{task_id}/manifest",
        {"algorithm": algorithm, "key_id": key_id, "signature": signature, "payload": payload},
        timeout=10,
    )
    MANIFEST_POST_TOTAL.labels(result="posted" if ok else "post_failed", algorithm=algorithm).inc()


def _lineage_ingest(task: dict, plugin_result: dict) -> None:
    result = plugin_result.get("result")
    if not isinstance(result, dict) or "lineage" not in result:
        return
    base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    token = _api_token()
    tenant_id = task.get("tenant_id", "default")
    project_id = task.get("project_id", "default_project")
    run_id = task.get("run_id")
    task_id = task.get("task_id")
    if not run_id or not task_id:
        return
    path = f"/v1/tenants/{tenant_id}/projects/{project_id}/lineage/ingest"
    body = {
        "run_id": run_id,
        "task_id": task_id,
        "lineage": result.get("lineage") or {},
    }
    req = urllib.request.Request(
        url=f"{base}{path}",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        data=json.dumps(body).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            return
    except urllib.error.URLError as exc:
        logger.warning("lineage_ingest_failed err=%s", exc)


def _log_plugin_tracking(task: dict, plugin_result: dict) -> None:
    result = plugin_result.get("result")
    if not isinstance(result, dict):
        return
    tenant_id = task.get("tenant_id", "default")
    project_id = task.get("project_id", "default_project")
    run_id = task.get("run_id")
    if not run_id:
        return
    base = f"/v1/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}"

    params = result.get("params")
    if isinstance(params, dict):
        for key, value in params.items():
            _tracking_post(f"{base}/params", {"key": str(key), "value": str(value)})

    metrics = result.get("metrics")
    if isinstance(metrics, dict):
        for key, value in metrics.items():
            if isinstance(value, dict):
                _tracking_post(
                    f"{base}/metrics",
                    {"key": str(key), "value": float(value.get("value", 0.0)), "step": int(value.get("step", 0))},
                )
            else:
                _tracking_post(f"{base}/metrics", {"key": str(key), "value": float(value), "step": 0})

    artifacts = result.get("artifacts")
    if isinstance(artifacts, list):
        for item in artifacts:
            if isinstance(item, dict):
                _tracking_post(f"{base}/artifacts", {"path": str(item.get("path", "")), "uri": item.get("uri")})


def main() -> None:
    metrics_port = int(os.getenv("ML_AIR_EXECUTOR_METRICS_PORT", "9103"))
    start_http_server(metrics_port)
    client = _redis()
    from otel_bootstrap import ensure_worker_tracing, otel_remote_carrier_from_event, otel_span

    ensure_worker_tracing(
        service_name=os.getenv("OTEL_SERVICE_NAME", "mlair-executor").strip() or "mlair-executor"
    )
    logger.info("executor_started metrics_port=%s", metrics_port)
    while True:
        message = client.blpop(["mlair:tasks:high", "mlair:tasks:default", "mlair:tasks:low"], timeout=2)
        if not message:
            continue

        queue_name, raw_payload = message
        QUEUE_INFLIGHT.labels(queue=queue_name).inc()
        task = json.loads(raw_payload)
        tenant_id = task.get("tenant_id", "default")
        project_id = task.get("project_id", "default_project")
        pipeline_id = task.get("pipeline_id", "demo_pipeline")
        with otel_span(
            "mlair.executor",
            "executor.execute_task",
            remote_carrier=otel_remote_carrier_from_event(task),
            mlair_run_id=str(task.get("run_id", "")),
            mlair_task_id=str(task.get("task_id", "")),
            mlair_trace_id=str(task.get("trace_id") or ""),
            mlair_pipeline_id=str(pipeline_id),
            mlair_pipeline_version_id=str(task.get("pipeline_version_id") or ""),
            mlair_tenant_id=str(tenant_id),
            mlair_project_id=str(project_id),
        ):
            from otel_bootstrap import resolve_trace_id_for_event, set_span_mlair_trace_id

            trace_id = resolve_trace_id_for_event(task)
            set_span_mlair_trace_id(trace_id)
            started_at = datetime.now(timezone.utc).isoformat()
            ref_sleep_ms = (os.getenv("ML_AIR_REFERENCE_TASK_SLEEP_MS") or "").strip()
            if ref_sleep_ms.isdigit():
                duration = max(0.0, int(ref_sleep_ms) / 1000.0)
            else:
                duration = random.uniform(0.2, 0.7)
            if pipeline_id.startswith("slow"):
                duration = 3.0
            task_start = time.perf_counter()
            cpu_start = time.process_time()
            rss_start = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss

            from sdk.resource_monitor import TaskResourceMonitor, merge_resource_usage, resource_monitor_enabled
            from sdk.independent_observation import IndependentObserver, independent_observation_enabled

            monitor: TaskResourceMonitor | None = None
            observer: IndependentObserver | None = None
            usage_report: dict[str, Any] | None = None
            observe_report: dict[str, Any] | None = None
            if resource_monitor_enabled():
                monitor = TaskResourceMonitor(task_id=str(task.get("task_id") or ""))
            if independent_observation_enabled():
                observer = IndependentObserver()

            http_task_cfg = task.get("http_task") if task.get("task_type") == "http" else None
            plugin_name = task.get("plugin_name")
            if not http_task_cfg and not plugin_name:
                if monitor is not None:
                    monitor.start(os.getpid())
                if observer is not None:
                    observer.start(os.getpid())
                time.sleep(duration)
            status = "SUCCESS"
            plugin_exec = None
            http_exec = None
            # Deterministic failure mode to validate retry/backoff flow.
            if pipeline_id.startswith("fail_once") and int(task.get("attempt", 1)) == 1:
                status = "FAILED"
            if pipeline_id.startswith("always_fail"):
                status = "FAILED"
            if http_task_cfg and isinstance(http_task_cfg, dict):
                if monitor is not None:
                    monitor.start(os.getpid())
                if observer is not None:
                    observer.start(os.getpid())
                from http_task_runner import run_http_task

                http_ctx = dict(task.get("context", {}))
                http_ctx.setdefault("run_id", task.get("run_id"))
                http_ctx.setdefault("task_id", task.get("task_id"))
                http_ctx.setdefault("tenant_id", tenant_id)
                http_ctx.setdefault("project_id", project_id)
                http_ctx.setdefault("pipeline_id", pipeline_id)
                http_ctx.setdefault("trace_id", trace_id)
                http_exec = run_http_task(http_task_cfg, http_ctx)
                plugin_exec = http_exec
                if not http_exec.get("ok"):
                    status = "FAILED"
            elif plugin_name:
                get_platform_token_manager().sync_process_env()
                plugin_ctx = build_plugin_execution_context(
                    task,
                    tenant_id=tenant_id,
                    project_id=project_id,
                    pipeline_id=pipeline_id,
                    trace_id=trace_id,
                )
                plugin_exec = _run_plugin_subprocess(
                    plugin_name=plugin_name,
                    context=plugin_ctx,
                    monitor=monitor,
                    observer=observer,
                )
                if not plugin_exec.get("ok"):
                    status = "FAILED"
                else:
                    _log_plugin_tracking(task=task, plugin_result=plugin_exec)
                    _lineage_ingest(task=task, plugin_result=plugin_exec)
            else:
                logger.info(
                    "reference_executor_stub_no_plugin run_id=%s task_id=%s pipeline_id=%s "
                    "(sleep only; no ML/ETL. Pass plugin_name on the run or plug in a real worker.)",
                    task.get("run_id"),
                    task.get("task_id"),
                    pipeline_id,
                )

            if monitor is not None:
                usage_report = monitor.stop()
            if observer is not None:
                try:
                    observe_report = observer.stop()
                except Exception:
                    logger.exception("independent_observer_stop_failed task_id=%s", task.get("task_id"))
                    observe_report = None

            finished_at = datetime.now(timezone.utc).isoformat()
            wall_seconds = time.perf_counter() - task_start
            cpu_seconds = max(0.0, time.process_time() - cpu_start)
            rss_end = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            rss_kb = int(max(rss_start, rss_end))
            legacy_ru = {
                "duration_ms": int(wall_seconds * 1000),
                "cpu_time_seconds": cpu_seconds,
                "memory_rss_kb": rss_kb,
            }
            monitored_ru = (usage_report or {}).get("resource_usage") if usage_report else None
            resource_usage = merge_resource_usage(legacy_ru, monitored_ru)
            usage_samples = (usage_report or {}).get("usage_samples") if usage_report else None
            resource_monitor_meta = (usage_report or {}).get("resource_monitor") if usage_report else None
            resource_events = (usage_report or {}).get("resource_events") if usage_report else None
            _post_manifest(task=task, plugin_result=plugin_exec, status=status)
            TASK_EXECUTED_TOTAL.labels(status=status, queue=queue_name).inc()
            TASK_DURATION_SECONDS.labels(pipeline_id=pipeline_id).observe(wall_seconds)
            logger.info(
                "task_finished run_id=%s task_id=%s status=%s attempt=%s pipeline_id=%s queue=%s trace_id=%s duration_ms=%s",
                task["run_id"],
                task["task_id"],
                status,
                task["attempt"],
                pipeline_id,
                queue_name,
                trace_id,
                int(wall_seconds * 1000),
            )
            finish_payload = {
                "task_id": task["task_id"],
                "attempt": task["attempt"],
                "pipeline_id": pipeline_id,
                "priority": task.get("priority", "normal"),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "trace_id": trace_id,
                "plugin_name": plugin_name,
                "task_type": task.get("task_type"),
                "plugin_exec": plugin_exec,
                "http_exec": http_exec,
                "queue": queue_name,
            }
            try:
                from sdk.mlair_log.store import append_log_entry

                append_log_entry(
                    run_id=task["run_id"],
                    task_id=task["task_id"],
                    level="INFO" if status == "SUCCESS" else "ERROR",
                    message=f'task {task["task_id"]} finished with {status}',
                    trace_id=trace_id,
                    payload=finish_payload,
                    plugin=plugin_name,
                    tenant_id=tenant_id,
                    project_id=project_id,
                    ts=datetime.fromisoformat(finished_at.replace("Z", "+00:00")),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "task_finish_log_persist_failed run_id=%s task_id=%s err=%s",
                    task["run_id"],
                    task["task_id"],
                    exc,
                )
            done_payload = {
                "event_type": "task_finished",
                "run_id": task["run_id"],
                "task_id": task["task_id"],
                "status": status,
                "attempt": task["attempt"],
                "pipeline_id": pipeline_id,
                "priority": task.get("priority", "normal"),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "trace_id": trace_id,
                "plugin_name": plugin_name,
                "task_type": task.get("task_type"),
                "http_task": http_task_cfg,
                "plugin_exec": plugin_exec,
                "context": task.get("context", {}),
                "started_at": started_at,
                "finished_at": finished_at,
                "resource_usage": resource_usage,
                "pipeline_version_id": task.get("pipeline_version_id"),
                "config_snapshot": task.get("config_snapshot"),
                "replay_from_task_id": task.get("replay_from_task_id"),
            }
            if usage_samples:
                done_payload["usage_samples"] = usage_samples
            if resource_monitor_meta:
                done_payload["resource_monitor"] = resource_monitor_meta
            if resource_events:
                done_payload["resource_events"] = resource_events
            if observe_report:
                if observe_report.get("resource_identity"):
                    done_payload["resource_identity"] = observe_report["resource_identity"]
                if observe_report.get("observed_usage"):
                    done_payload["observed_usage"] = observe_report["observed_usage"]
            if resource_monitor_enabled() and monitor is not None:
                has_samples = bool(usage_samples)
                ru = resource_usage if isinstance(resource_usage, dict) else {}
                has_ru = any(ru.get(k) for k in ("duration_ms", "cpu_time_seconds", "memory_rss_kb", "gpu_seconds"))
                if not has_samples and not has_ru:
                    TASK_USAGE_MISSING_TOTAL.labels(pipeline_id=pipeline_id, status=status).inc()
                    logger.warning(
                        "task_finished_missing_usage run_id=%s task_id=%s pipeline_id=%s status=%s",
                        task["run_id"],
                        task["task_id"],
                        pipeline_id,
                        status,
                    )
            from otel_bootstrap import inject_w3c_carrier_on_event

            inject_w3c_carrier_on_event(done_payload)
            client.rpush("mlair:tasks:done", json.dumps(done_payload))
            QUEUE_INFLIGHT.labels(queue=queue_name).dec()


if __name__ == "__main__":
    main()
