#!/usr/bin/env python3
"""Phase 2 verification (G1 + observability APIs) against a running `mlair serve` stack."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", os.getenv("ML_AIR_API_BASE_URL", "http://127.0.0.1:8080")).rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")
TOKEN = os.getenv("ML_AIR_TRACKING_TOKEN", os.getenv("MLAIR_API_TOKEN", "admin-token"))
RUN_ID = (os.getenv("MLAIR_VERIFY_RUN_ID") or "").strip()
MIN_SAMPLES = int(os.getenv("MLAIR_VERIFY_MIN_SAMPLES", "10"))
REQUIRE_GPU = os.getenv("MLAIR_VERIFY_REQUIRE_GPU", "0").strip() not in {
    "0",
    "false",
    "False",
}


def req(method: str, path: str, *, body: dict | None = None) -> tuple[int, dict]:
    headers = {"Authorization": f"Bearer {TOKEN}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload or "{}")
        except Exception:
            return exc.code, {"raw": payload}


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}", file=sys.stderr)
    raise SystemExit(1)


def ok(msg: str) -> None:
    print(f"[PASS] {msg}")


def main() -> int:
    if not RUN_ID:
        fail("MLAIR_VERIFY_RUN_ID is required")

    require_api_reachable(BASE)

    prefix = f"/v1/tenants/{TENANT}/projects/{PROJECT}"

    c, run = req("GET", f"{prefix}/runs/{RUN_ID}")
    if c != 200:
        fail(f"GET run → HTTP {c}: {run}")
    status = str(run.get("status") or "").upper()
    if status != "SUCCESS":
        fail(f"run status is {status}, expected SUCCESS")
    env = run.get("environment")
    if not isinstance(env, dict) or not env:
        fail("run.environment is empty")
    ok(f"run {RUN_ID} SUCCESS with environment ({len(env)} keys)")

    c, usage = req("GET", f"{prefix}/runs/{RUN_ID}/usage")
    if c != 200:
        fail(f"GET run usage → HTTP {c}: {usage}")
    items = usage.get("items") if isinstance(usage.get("items"), list) else []
    if not items:
        fail("no task_usage rows on run (G1)")
    missing = []
    for row in items:
        tid = row.get("task_id")
        has_peak = any(
            row.get(k) is not None
            for k in ("cpu_pct_peak", "memory_mb_peak", "gpu_util_pct_peak", "gpu_memory_mb_peak")
        )
        sc = row.get("sample_count")
        if not has_peak and not (isinstance(sc, int) and sc > 0):
            missing.append(tid)
    if missing:
        fail(f"tasks without usage attribution (G1): {missing[:5]}")
    ok(f"G1: {len(items)} task(s) with task_usage")

    c, samples_resp = req("GET", f"{prefix}/runs/{RUN_ID}/usage-samples?limit=1000")
    if c != 200:
        fail(f"GET usage-samples → HTTP {c}: {samples_resp}")
    samples = samples_resp.get("samples") if isinstance(samples_resp.get("samples"), list) else []
    if len(samples) < MIN_SAMPLES:
        fail(f"usage-samples count {len(samples)} < MLAIR_VERIFY_MIN_SAMPLES={MIN_SAMPLES}")
    gpu_vals = [
        s.get("gpu_util_percent")
        for s in samples
        if isinstance(s, dict) and s.get("gpu_util_percent") is not None
    ]
    if REQUIRE_GPU:
        if not gpu_vals:
            fail("no gpu_util_percent in usage_samples")
        if max(float(v) for v in gpu_vals) <= 0:
            fail("gpu_util_percent samples are all zero")
        ok(f"2.1: {len(samples)} samples, GPU peak {max(float(v) for v in gpu_vals):.1f}%")
    else:
        ok(f"2.1: {len(samples)} usage samples")

    model_id = (os.getenv("MLAIR_VERIFY_MODEL_ID") or "").strip()
    if model_id:
        c, prov = req("GET", f"{prefix}/models/{model_id}/provenance")
        if c != 200:
            fail(f"GET model provenance → HTTP {c}: {prov}")
        if not prov.get("model_version"):
            fail("model provenance missing model_version")
        if not prov.get("run"):
            fail("model provenance missing run hop")
        ok(f"2.3: model {model_id} provenance chain ({prov.get('run', {}).get('run_id')})")

    dataset_id = (os.getenv("MLAIR_VERIFY_DATASET_ID") or "").strip()
    from_v = (os.getenv("MLAIR_VERIFY_DIFF_FROM") or "").strip()
    to_v = (os.getenv("MLAIR_VERIFY_DIFF_TO") or "").strip()
    if dataset_id and from_v and to_v:
        c, diff = req("GET", f"{prefix}/datasets/{dataset_id}/versions/diff?from={from_v}&to={to_v}")
        if c != 200:
            fail(f"GET version diff → HTTP {c}: {diff}")
        if "delta" not in diff:
            fail("diff response missing delta")
        ok(f"2.2: dataset diff record_count_delta={diff['delta'].get('record_count_delta')}")

    print(f"[PASS] Phase 2 verify complete for run_id={RUN_ID}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
