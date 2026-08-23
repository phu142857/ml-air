"""Composable admission explanation across readiness, policy, quota, and promote gates."""

from __future__ import annotations

from typing import Any


def explain_run_admission(
    *,
    tenant_id: str,
    project_id: str,
    pipeline_id: str | None = None,
    dataset_version_id: str | None = None,
    model_id: str | None = None,
    target_stage: str = "production",
    version: int | None = None,
    resources: dict | None = None,
) -> dict[str, Any]:
    """
    Aggregate admission / governance blockers into one explainable payload.

    Does not create a run. Safe for Hub preflight / dry-run UI.
    """
    checks: list[dict[str, Any]] = []
    blocking = False
    quota_exceeded = False
    policy_reason: str | None = None

    resolved_pipeline_id = str(pipeline_id or "").strip() or None
    if not resolved_pipeline_id and model_id:
        try:
            from app.domains.governance.model_registry_service import resolve_model_pipeline

            mapped = resolve_model_pipeline(tenant_id, project_id, model_id)
            resolved_pipeline_id = str(mapped.get("pipeline_id") or "").strip() or None
        except Exception:
            resolved_pipeline_id = None

    # Quota: catalog ceilings (projects/datasets/models/runs) — report current usage.
    try:
        from app.domains.governance.tenant_quota_service import (
            TenantQuotaExceeded,
            assert_within_quota,
            enforcement_enabled,
            get_tenant_quotas,
            get_tenant_usage,
        )

        quotas = get_tenant_quotas(tenant_id)
        usage = get_tenant_usage(tenant_id, project_id)
        quota_ok = True
        quota_code = None
        if enforcement_enabled():
            try:
                assert_within_quota(tenant_id, "runs", project_id=project_id)
            except TenantQuotaExceeded as exc:
                quota_ok = False
                quota_exceeded = True
                quota_code = "TENANT_QUOTA"
                policy_reason = policy_reason or "TENANT_QUOTA"
        checks.append(
            {
                "layer": "tenant_quota",
                "ok": quota_ok,
                "code": quota_code,
                "quotas": quotas,
                "usage": usage,
                "message": "Quota snapshot (enforced at create/upload boundaries).",
            }
        )
    except Exception as exc:
        checks.append({"layer": "tenant_quota", "ok": False, "code": "quota_lookup_failed", "message": str(exc)})

    # Pipeline input readiness
    if resolved_pipeline_id:
        try:
            from app.domains.lifecycle.readiness_service import evaluate_pipeline_inputs_readiness
            from app.domains.orchestration import pipeline_version_service

            pipeline_cfg: dict[str, Any] = {}
            latest_pv = pipeline_version_service.get_latest_version_id(
                tenant_id, project_id, resolved_pipeline_id
            )
            if latest_pv:
                pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
                if pv_row and isinstance(pv_row.get("config"), dict):
                    pipeline_cfg = pv_row.get("config") or {}

            override_config: dict[str, Any] = {}
            plugin_context: dict[str, Any] = {}
            if dataset_version_id:
                override_config["dataset_version_id"] = dataset_version_id
                plugin_context["dataset_version_id"] = dataset_version_id

            ready = evaluate_pipeline_inputs_readiness(
                tenant_id=tenant_id,
                project_id=project_id,
                pipeline_config=pipeline_cfg,
                override_config=override_config,
                plugin_context=plugin_context,
            )
            ok = bool(ready.get("ready")) if isinstance(ready, dict) else bool(ready)
            if not ok:
                blocking = True
                policy_reason = policy_reason or "PIPELINE_INPUTS_NOT_READY"
            checks.append(
                {
                    "layer": "pipeline_inputs",
                    "ok": ok,
                    "code": None if ok else "PIPELINE_INPUTS_NOT_READY",
                    "pipeline_id": resolved_pipeline_id,
                    "pipeline_version_id": latest_pv,
                    "detail": ready if isinstance(ready, dict) else {"ready": ok},
                    "message": "Pipeline declared input cardinality / readiness.",
                }
            )
        except Exception as exc:
            blocking = True
            policy_reason = policy_reason or "PIPELINE_INPUTS_NOT_READY"
            checks.append(
                {
                    "layer": "pipeline_inputs",
                    "ok": False,
                    "code": "pipeline_inputs_eval_failed",
                    "message": str(exc),
                }
            )

    # Training-policy eligibility (when dataset pin present)
    if dataset_version_id:
        try:
            from app.domains.lifecycle import lineage_service
            from app.domains.lifecycle.readiness_service import evaluate_dataset_readiness

            dv = lineage_service.get_dataset_version(tenant_id, project_id, dataset_version_id)
            if not dv:
                blocking = True
                policy_reason = policy_reason or "dataset_version_not_found"
                checks.append(
                    {
                        "layer": "training_policy",
                        "ok": False,
                        "code": "dataset_version_not_found",
                        "message": "Pinned dataset_version_id was not found.",
                    }
                )
            else:
                dataset_id = str(dv.get("dataset_id") or "").strip()
                elig = evaluate_dataset_readiness(
                    tenant_id=tenant_id,
                    project_id=project_id,
                    dataset_id=dataset_id,
                    dataset_version_id=dataset_version_id,
                )
                ok = bool(elig.get("ready")) if isinstance(elig, dict) else bool(elig)
                if not ok:
                    blocking = True
                    policy_reason = policy_reason or "MLAIR_READINESS_NOT_ELIGIBLE"
                checks.append(
                    {
                        "layer": "training_policy",
                        "ok": ok,
                        "code": None if ok else "MLAIR_READINESS_NOT_ELIGIBLE",
                        "detail": elig if isinstance(elig, dict) else {"ready": ok},
                        "message": "Training-policy eligibility (size/freshness/validation).",
                    }
                )
        except Exception as exc:
            # Policy may be optional depending on route; keep non-fatal unless explicit failure codes.
            code = str(exc)
            fatal = code in {
                "dataset_not_found",
                "dataset_version_not_found",
                "dataset_training_policy_not_found",
            }
            if fatal:
                blocking = True
                policy_reason = policy_reason or "TRAINING_POLICY_REQUIRED"
            checks.append(
                {
                    "layer": "training_policy",
                    "ok": not fatal,
                    "code": "training_policy_eval_failed" if fatal else "training_policy_skipped",
                    "message": code,
                }
            )

    # Promotion eligibility (optional)
    if model_id and version is not None:
        try:
            from app.domains.governance.model_registry_service import evaluate_promotion_eligibility

            promo = evaluate_promotion_eligibility(
                tenant_id, project_id, model_id, int(version), target_stage=target_stage
            )
            if promo is None:
                checks.append(
                    {
                        "layer": "promotion",
                        "ok": False,
                        "code": "model_version_not_found",
                        "message": "Model version not found for promotion eligibility.",
                    }
                )
                blocking = True
                policy_reason = policy_reason or "GOVERNANCE_BLOCKED"
            else:
                ok = bool(promo.get("eligible"))
                if not ok:
                    blocking = True
                    policy_reason = policy_reason or "GOVERNANCE_BLOCKED"
                checks.append(
                    {
                        "layer": "promotion",
                        "ok": ok,
                        "code": None if ok else "GOVERNANCE_BLOCKED",
                        "detail": promo,
                        "message": "Promotion policy / approval gate.",
                    }
                )
        except Exception as exc:
            checks.append({"layer": "promotion", "ok": False, "code": "promotion_eval_failed", "message": str(exc)})
            blocking = True
            policy_reason = policy_reason or "GOVERNANCE_BLOCKED"

    from app.domains.governance.admission_decision import (
        ACCEPT,
        classify_admission,
        parse_demand,
        snapshot_resource_state,
    )

    demand = parse_demand(resources=resources)
    try:
        resource_state = snapshot_resource_state(tenant_id=tenant_id, project_id=project_id)
    except Exception:
        from app.domains.governance.admission_decision import build_resource_state

        resource_state = build_resource_state()
    resource_decision, resource_reason = classify_admission(
        resource_state=resource_state,
        demand=demand,
    )
    checks.append(
        {
            "layer": "resource_state",
            "ok": resource_decision == ACCEPT,
            "code": None if resource_decision == ACCEPT else resource_reason,
            "decision": resource_decision,
            "demand": demand,
            "detail": resource_state,
            "message": "Cluster/tenant ResourceState (CPU, memory, GPU, task slots).",
        }
    )
    decision, reason = classify_admission(
        policy_blocking=blocking,
        policy_reason=policy_reason,
        quota_exceeded=quota_exceeded,
        resource_state=resource_state,
        demand=demand,
    )
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "pipeline_id": resolved_pipeline_id,
        "admitted": decision == ACCEPT,
        "blocking": blocking or quota_exceeded,
        "decision": decision,
        "reason": reason,
        "demand": demand,
        "resource_state": resource_state,
        "checks": checks,
    }


def preview_trigger_policy(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
) -> dict[str, Any]:
    """Dry-run preview for model auto-trigger policy (no run created)."""
    from app.domains.governance.trigger_policy_service import get_trigger_policy

    policy = get_trigger_policy(tenant_id, project_id, model_id)
    mode = str(policy.get("trigger_mode") or "manual")
    would_trigger = False
    skip_reason: str | None = None
    notes: list[str] = []
    admission: dict[str, Any] | None = None

    pipeline_id: str | None = None
    try:
        from app.domains.governance.model_registry_service import resolve_model_pipeline

        mapped = resolve_model_pipeline(tenant_id, project_id, model_id)
        pipeline_id = str(mapped.get("pipeline_id") or "").strip() or None
    except Exception:
        pipeline_id = None

    if mode == "manual":
        skip_reason = "manual_mode"
        notes.append("Trigger mode is manual; scheduler will not auto-create runs.")
    elif mode == "auto_ready":
        dv = str(policy.get("dataset_version_id") or "").strip()
        if not pipeline_id:
            skip_reason = "no_pipeline_mapping"
            notes.append("Model has no mapped pipeline; auto_ready cannot create a run.")
        elif not dv:
            skip_reason = "no_data_anchor"
            notes.append("auto_ready requires a dataset_version_id data anchor.")
        else:
            admission = explain_run_admission(
                tenant_id=tenant_id,
                project_id=project_id,
                pipeline_id=pipeline_id,
                dataset_version_id=dv,
                model_id=model_id,
            )
            if admission.get("admitted"):
                would_trigger = True
                notes.append("Eligibility + pipeline inputs look ready (debounce not evaluated in preview).")
            else:
                skip_reason = "not_eligible_or_gate_blocked"
                notes.append("Admission explain reports blockers; see checks.")
    elif mode == "schedule":
        cron = str(policy.get("schedule_cron") or "").strip()
        if not cron:
            skip_reason = "no_cron"
            notes.append("schedule mode requires schedule_cron.")
        elif not pipeline_id:
            skip_reason = "no_pipeline_mapping"
            notes.append("Model has no mapped pipeline; schedule cannot create a run.")
        else:
            notes.append(f"Cron configured ({cron}); due-now is evaluated only on scheduler ticks.")
            would_trigger = True
            skip_reason = None
    else:
        skip_reason = "unknown_mode"
        notes.append(f"Unknown trigger_mode={mode}")

    out: dict[str, Any] = {
        "policy": policy,
        "pipeline_id": pipeline_id,
        "would_trigger": would_trigger,
        "skip_reason": skip_reason or policy.get("last_skip_reason"),
        "notes": notes,
        "dry_run": True,
    }
    if admission is not None:
        out["admission"] = admission
    return out
