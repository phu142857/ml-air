#!/usr/bin/env python3
"""P0 attribution report from exported Hub evidence (R0) or P3 evidence directories.

Classification: RECONSTRUCTED (transcript b221ee95 + Phase 1D enhancements for R0 layout).

Purpose: document attribution-chain integrity from frozen Hub JSON. This tool does NOT
claim statistical attribution accuracy and does NOT fabricate ground-truth comparisons.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CLASSIFICATION = "RECONSTRUCTED"
SOURCES = [
    "Cursor transcript b221ee95 Write (base)",
    "Phase 1D enhancement for R0 Hub export layout",
]

DISCLAIMER = (
    "CHAIN INTEGRITY documents that run → task → executor → plugin → PID → "
    "observation → usage fields are present and linked. "
    "ATTRIBUTION ACCURACY requires independent ground truth and is NOT claimed here."
)


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _unwrap_body(doc: dict[str, Any]) -> dict[str, Any]:
    body = doc.get("body")
    return body if isinstance(body, dict) else doc


def _chain_step(name: str, ok: bool, detail: str) -> dict[str, Any]:
    return {"step": name, "ok": ok, "detail": detail}


def _resolve_evidence_paths(evidence_dir: Path) -> dict[str, Path]:
    """Map logical artifact names to on-disk paths (R0 export or collector layout)."""
    candidates: dict[str, list[str]] = {
        "run": ["run.json", "01-run.json"],
        "tasks": ["tasks.json", "02-tasks.json"],
        "run_usage": ["run-usage.json", "03-run-usage.json"],
        "task_train": ["task.json", "task-train.json"],
        "attribution_train": ["attribution.json", "attribution-train.json"],
        "model_version": ["model_version_for_run.json", "10-model-version-for-run.json"],
        "verify": ["verify.json"],
        "summary": ["SUMMARY.json"],
    }
    resolved: dict[str, Path] = {}
    for key, names in candidates.items():
        for name in names:
            path = evidence_dir / name
            if path.is_file():
                resolved[key] = path
                break
    return resolved


def _pick_train_task(tasks_doc: dict[str, Any], run_id: str) -> dict[str, Any]:
    body = _unwrap_body(tasks_doc)
    items = body.get("items") if isinstance(body.get("items"), list) else []
    for task in items:
        if not isinstance(task, dict):
            continue
        plugin = str(task.get("plugin") or task.get("plugin_name") or "")
        if plugin == "cv_yolo_train" or str(task.get("task_id") or "").endswith(":train"):
            return task
    for task in items:
        if isinstance(task, dict) and str(task.get("task_id") or "").endswith(":train"):
            return task
    return {}


def build_report(evidence_dir: Path, *, run_id: str | None = None, plugin_filter: str = "cv_yolo_train") -> dict[str, Any]:
    paths = _resolve_evidence_paths(evidence_dir)

    run_doc = _load_json(paths.get("run", Path()))
    run_body = _unwrap_body(run_doc)
    run_id = run_id or str(run_body.get("run_id") or run_body.get("id") or "").strip()

    task = _load_json(paths.get("task_train", Path()))
    if not task:
        task = _pick_train_task(_load_json(paths.get("tasks", Path())), run_id)

    attr = _load_json(paths.get("attribution_train", Path()))
    mv_for_run = _load_json(paths.get("model_version", Path()))
    verify = _load_json(paths.get("verify", Path()))
    summary = _load_json(paths.get("summary", Path()))

    plugin_context = run_body.get("plugin_context") if isinstance(run_body.get("plugin_context"), dict) else {}
    experiment_label = str(plugin_context.get("experiment_label") or run_body.get("experiment_label") or "unknown")
    execution_mode = str(plugin_context.get("execution_mode") or "internal")

    task_id = str(task.get("task_id") or attr.get("task_id") or "").strip()
    plugin = str(task.get("plugin") or task.get("plugin_name") or attr.get("usage", {}).get("plugin") or "")

    usage = attr.get("usage") if isinstance(attr.get("usage"), dict) else {}
    reported = attr.get("reported_usage") if isinstance(attr.get("reported_usage"), dict) else {}
    observed = attr.get("observed_usage") if isinstance(attr.get("observed_usage"), dict) else {}
    identity = attr.get("resource_identity") if isinstance(attr.get("resource_identity"), dict) else {}

    child_pid = identity.get("pid") or identity.get("child_pids")
    observation_source = observed.get("observation_source") or "procfs"
    worker_id = identity.get("worker_id") or identity.get("hostname")

    chain: list[dict[str, Any]] = [
        _chain_step("run_id", bool(run_id), run_id or "missing"),
        _chain_step("task_id", bool(task_id), task_id or "missing"),
        _chain_step("execution_mode", execution_mode == "internal", execution_mode or "missing"),
        _chain_step(
            "executor_worker",
            bool(worker_id),
            f"worker_id={worker_id or 'missing'} (internal executor on YOLO worker)",
        ),
        _chain_step("plugin", plugin == plugin_filter, plugin or "missing"),
        _chain_step("child_pid", bool(child_pid), str(child_pid or "missing")),
        _chain_step(
            "independent_observer",
            bool(observed) and attr.get("attribution_source") == "observed",
            f"observation_source={observation_source}",
        ),
        _chain_step(
            "observed_resource_usage",
            bool(observed.get("memory_mb_peak") or observed.get("duration_seconds")),
            (
                f"peak_ram_mb={observed.get('memory_mb_peak')}, "
                f"duration_s={observed.get('duration_seconds')}, "
                f"samples={observed.get('sample_count')}"
            ),
        ),
        _chain_step("attribution_source", bool(attr.get("attribution_source")), str(attr.get("attribution_source") or "missing")),
        _chain_step("telemetry_trust", bool(attr.get("telemetry_trust")), str(attr.get("telemetry_trust") or "missing")),
    ]

    chain_ok = all(step["ok"] for step in chain)

    matched = mv_for_run.get("matched") if isinstance(mv_for_run.get("matched"), list) else []
    lineage_ok = bool(matched) and all(str(v.get("run_id") or "") == run_id for v in matched if isinstance(v, dict))

    report: dict[str, Any] = {
        "classification": CLASSIFICATION,
        "sources": SOURCES,
        "report_type": "P0_attribution_chain",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": DISCLAIMER,
        "run_id": run_id,
        "task_id": task_id,
        "execution_mode": execution_mode,
        "experiment_label": experiment_label,
        "run_status": run_body.get("status") or summary.get("run_status"),
        "chain_integrity": "PASS" if chain_ok else "FAIL",
        "attribution_accuracy": {
            "status": "not_claimed",
            "note": "No ground-truth cross-check in this report. See P3.1 protocol for comparability rules.",
        },
        "chain": chain,
        "resource_identity": identity,
        "attribution_source": attr.get("attribution_source"),
        "telemetry_trust": attr.get("telemetry_trust"),
        "trust_reason": attr.get("trust_reason"),
        "usage_summary": {
            "runtime_seconds": usage.get("runtime_seconds"),
            "cpu_seconds": usage.get("cpu_seconds"),
            "memory_mb_peak": usage.get("memory_mb_peak"),
            "memory_rss_peak_kb": usage.get("memory_rss_peak_kb"),
            "sample_count": usage.get("sample_count"),
        },
        "reported_usage_summary": {
            "runtime_seconds": reported.get("runtime_seconds"),
            "memory_mb_peak": reported.get("memory_mb_peak"),
            "memory_rss_peak_kb": reported.get("memory_rss_peak_kb"),
        },
        "observed_usage_summary": {
            "duration_seconds": observed.get("duration_seconds"),
            "memory_mb_peak": observed.get("memory_mb_peak"),
            "cpu_percent_peak": observed.get("cpu_percent_peak"),
            "sample_count": observed.get("sample_count"),
            "observation_source": observation_source,
        },
        "ground_truth": {
            "status": "not_collected",
            "note": "L1/L2 observation cross-checks are defined in P3.1; not computed unless explicitly collected.",
        },
        "attribution_error": {
            "status": "not_computed",
            "relative_error_memory_mb": None,
            "note": "Requires ground-truth candidate; never inferred from Hub fields alone.",
        },
        "model_lineage": {
            "matched_versions": len(matched),
            "run_id_match": lineage_ok,
            "versions": matched,
        },
        "verify_exit_gates": verify.get("exit_gates") if verify else None,
        "evidence_dir": str(evidence_dir),
        "evidence_files": {k: str(v) for k, v in paths.items()},
    }
    return report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# P0 Attribution Report",
        "",
        f"> **Classification:** `{report.get('classification')}`",
        f"> **{report['disclaimer']}**",
        "",
        f"- **Generated:** {report['generated_at']}",
        f"- **Run ID:** `{report['run_id']}`",
        f"- **Task ID:** `{report['task_id']}`",
        f"- **Execution:** {report['execution_mode']}",
        f"- **Experiment:** {report.get('experiment_label')}",
        f"- **Chain integrity:** **{report['chain_integrity']}**",
        f"- **Attribution accuracy:** {report['attribution_accuracy']['status']}",
        "",
        "## Chain integrity (not accuracy)",
        "",
        "```text",
        "run_id → task_id → execution_mode → executor/worker → plugin",
        "  → child PID → IndependentObserver → observed usage",
        "  → attribution_source → telemetry_trust",
        "```",
        "",
        "| Step | Status | Detail |",
        "|------|--------|--------|",
    ]
    for step in report.get("chain") or []:
        status = "PASS" if step.get("ok") else "FAIL"
        lines.append(f"| {step.get('step')} | {status} | {step.get('detail')} |")

    u = report.get("usage_summary") or {}
    o = report.get("observed_usage_summary") or {}
    r = report.get("reported_usage_summary") or {}
    rid = report.get("resource_identity") or {}

    lines.extend(
        [
            "",
            "## Trust (frozen Hub values — do not retroactively modify)",
            "",
            f"- **attribution_source:** `{report.get('attribution_source')}`",
            f"- **telemetry_trust:** `{report.get('telemetry_trust')}`",
            f"- **trust_reason:** `{report.get('trust_reason')}`",
            "",
            "## Resource identity",
            "",
            f"- **child PID:** `{rid.get('pid')}`",
            f"- **worker_id:** `{rid.get('worker_id')}`",
            f"- **hostname:** `{rid.get('hostname')}`",
            "",
            "## Usage (SoT overlay from Hub)",
            "",
            f"- **runtime_seconds:** {u.get('runtime_seconds')}",
            f"- **cpu_seconds:** {u.get('cpu_seconds')}",
            f"- **memory_mb_peak:** {u.get('memory_mb_peak')}",
            f"- **sample_count:** {u.get('sample_count')}",
            "",
            "## Observed (IndependentObserver)",
            "",
            f"- **observation_source:** `{o.get('observation_source')}`",
            f"- **duration_seconds:** {o.get('duration_seconds')}",
            f"- **memory_mb_peak:** {o.get('memory_mb_peak')}",
            f"- **cpu_percent_peak:** {o.get('cpu_percent_peak')}",
            "",
            "## Reported (advisory)",
            "",
            f"- **runtime_seconds:** {r.get('runtime_seconds')}",
            f"- **memory_mb_peak:** {r.get('memory_mb_peak')}",
            "",
            "## Ground truth / error",
            "",
            f"- **ground_truth:** {report.get('ground_truth', {}).get('status')}",
            f"- **attribution_error:** {report.get('attribution_error', {}).get('status')}",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate P0 attribution report from frozen Hub evidence")
    parser.add_argument("evidence_dir", type=Path, help="R0 Hub export dir or P3 evidence collector output")
    parser.add_argument("--run-id", default=None, help="Override run_id")
    parser.add_argument("--out-json", type=Path, default=None)
    parser.add_argument("--out-md", type=Path, default=None)
    args = parser.parse_args(argv)

    evidence = args.evidence_dir.resolve()
    if not evidence.is_dir():
        print(f"evidence dir not found: {evidence}", file=sys.stderr)
        return 2

    report = build_report(evidence, run_id=args.run_id)
    out_json = args.out_json or evidence / "p0-attribution-report.json"
    out_md = args.out_md or evidence / "p0-attribution-report.md"

    out_json.write_text(json.dumps(report, indent=2) + "\n")
    out_md.write_text(render_markdown(report))

    print(f"Wrote {out_json}")
    print(f"Wrote {out_md}")
    print(f"chain_integrity={report['chain_integrity']} telemetry_trust={report.get('telemetry_trust')}")
    return 0 if report["chain_integrity"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
