import json
import os
import random
import subprocess
import time
import urllib.error
import urllib.request
import hashlib
import hmac
import base64
from functools import lru_cache
from datetime import datetime, timezone

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from redis import Redis

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


def _run_plugin_subprocess(plugin_name: str, context: dict) -> dict:
    timeout_seconds = int(os.getenv("ML_AIR_PLUGIN_TIMEOUT_SECONDS", "120"))
    runner_module = os.getenv("ML_AIR_PLUGIN_RUNNER_MODULE", "mlair_runner")
    try:
        proc = subprocess.run(
            ["python", "-m", runner_module, plugin_name],
            input=json.dumps(context),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"timeout_after_{timeout_seconds}s"}
    if proc.returncode != 0:
        return {
            "ok": False,
            "error": f"exit_code={proc.returncode}",
            "stderr": (proc.stderr or "").strip(),
            "stdout": (proc.stdout or "").strip(),
        }
    try:
        parsed = json.loads(proc.stdout or "{}")
        return {"ok": True, "result": parsed, "stderr": (proc.stderr or "").strip()}
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid_json_output: {exc}", "stdout": (proc.stdout or "").strip()}


def _tracking_post(path: str, payload: dict) -> None:
    base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    token = os.getenv("ML_AIR_TRACKING_TOKEN", "maintainer-token")
    req = urllib.request.Request(
        url=f"{base}{path}",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=5):
            return
    except urllib.error.URLError as exc:
        print(f"tracking post failed path={path} err={exc}")


def _api_post(path: str, payload: dict, timeout: int = 10) -> bool:
    base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    token = os.getenv("ML_AIR_TRACKING_TOKEN", "maintainer-token")
    req = urllib.request.Request(
        url=f"{base}{path}",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout):
            return True
    except urllib.error.URLError as exc:
        print(f"api post failed path={path} err={exc}")
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
    return os.getenv("ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE", "0") == "1"


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
        print(f"manifest sign failed: {exc}")
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
    token = os.getenv("ML_AIR_TRACKING_TOKEN", "maintainer-token")
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
        print(f"lineage ingest failed: {exc}")


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
    print(f"executor started (metrics on :{metrics_port})")
    while True:
        message = client.blpop(["mlair:tasks:high", "mlair:tasks:default", "mlair:tasks:low"], timeout=2)
        if not message:
            continue

        queue_name, raw_payload = message
        QUEUE_INFLIGHT.labels(queue=queue_name).inc()
        task = json.loads(raw_payload)
        tenant_id = task.get("tenant_id", "default")
        project_id = task.get("project_id", "default_project")
        trace_id = task.get("trace_id")
        started_at = datetime.now(timezone.utc).isoformat()
        duration = random.uniform(0.2, 0.7)
        pipeline_id = task.get("pipeline_id", "demo_pipeline")
        if pipeline_id.startswith("slow"):
            duration = 3.0
        task_start = time.perf_counter()
        time.sleep(duration)
        finished_at = datetime.now(timezone.utc).isoformat()
        status = "SUCCESS"
        plugin_exec = None
        # Deterministic failure mode to validate retry/backoff flow.
        if pipeline_id.startswith("fail_once") and int(task.get("attempt", 1)) == 1:
            status = "FAILED"
        if pipeline_id.startswith("always_fail"):
            status = "FAILED"
        plugin_name = task.get("plugin_name")
        if plugin_name:
            plugin_exec = _run_plugin_subprocess(plugin_name=plugin_name, context=task.get("context", {}))
            if not plugin_exec.get("ok"):
                status = "FAILED"
            else:
                _log_plugin_tracking(task=task, plugin_result=plugin_exec)
                _lineage_ingest(task=task, plugin_result=plugin_exec)
        _post_manifest(task=task, plugin_result=plugin_exec, status=status)
        TASK_EXECUTED_TOTAL.labels(status=status, queue=queue_name).inc()
        TASK_DURATION_SECONDS.labels(pipeline_id=pipeline_id).observe(time.perf_counter() - task_start)
        print(
            json.dumps(
                {
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
                    "plugin_exec": plugin_exec,
                    "queue": queue_name,
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            )
        )
        client.rpush(
            f'mlair:logs:{task["run_id"]}',
            json.dumps(
                {
                    "ts": finished_at,
                    "level": "INFO" if status == "SUCCESS" else "ERROR",
                    "message": f'task {task["task_id"]} finished with {status}',
                    "payload": {
                        "task_id": task["task_id"],
                        "attempt": task["attempt"],
                        "pipeline_id": pipeline_id,
                        "priority": task.get("priority", "normal"),
                        "tenant_id": tenant_id,
                        "project_id": project_id,
                        "trace_id": trace_id,
                        "plugin_name": plugin_name,
                        "plugin_exec": plugin_exec,
                        "queue": queue_name,
                    },
                }
            ),
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
            "plugin_exec": plugin_exec,
            "context": task.get("context", {}),
            "started_at": started_at,
            "finished_at": finished_at,
            "pipeline_version_id": task.get("pipeline_version_id"),
            "config_snapshot": task.get("config_snapshot"),
            "replay_from_task_id": task.get("replay_from_task_id"),
        }
        client.rpush("mlair:tasks:done", json.dumps(done_payload))
        QUEUE_INFLIGHT.labels(queue=queue_name).dec()


if __name__ == "__main__":
    main()
