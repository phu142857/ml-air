"""Import boundary rules for Phase 6 (checked by ``tests/test_import_boundaries.py``)."""

from __future__ import annotations

# Domains may import only from themselves + shared + allowed downstream targets.
ALLOWED_IMPORTS: dict[str, frozenset[str]] = {
    "lifecycle": frozenset({"lifecycle", "shared", "observability"}),
    "orchestration": frozenset({"orchestration", "shared", "lifecycle", "observability", "governance"}),
    "governance": frozenset({"governance", "shared", "lifecycle", "observability"}),
    "observability": frozenset({"observability", "shared", "lifecycle", "orchestration"}),
    "shared": frozenset({"shared"}),
}

# Explicit leaks to eliminate (enforced on mapped modules under app/services and app/domains).
FORBIDDEN_IMPORTS: dict[str, frozenset[str]] = {
    "lifecycle": frozenset({"orchestration", "governance"}),
}

# Module path fragment (after app.) -> domain. Longest match wins when checking.
MODULE_DOMAIN: dict[str, str] = {
    "domains.lifecycle": "lifecycle",
    "domains.orchestration": "orchestration",
    "domains.governance": "governance",
    "domains.observability": "observability",
    "domains.shared": "shared",
    "services.lineage_service": "lifecycle",
    "services.readiness_service": "lifecycle",
    "services.readiness_canonical_codes": "lifecycle",
    "services.readiness_evaluation_semantics": "lifecycle",
    "services.realtime_events": "lifecycle",
    "services.run_service": "orchestration",
    "services.task_service": "orchestration",
    "services.pipeline_version_service": "orchestration",
    "services.queue_service": "shared",
    "services.worker_task_service": "orchestration",
    "services.log_service": "orchestration",
    "services.manifest_service": "orchestration",
    "services.tracking_service": "orchestration",
    "services.search_service": "orchestration",
    "services.model_registry_service": "governance",
    "services.trigger_policy_service": "governance",
    "services.auth_service": "governance",
    "services.scope_context_service": "governance",
    "services.project_service": "governance",
    "services.semantic_webhook_subscription_service": "governance",
    "services.executor_promote_webhook_service": "governance",
    "services.trace_service": "observability",
    "services.audit_timeline_service": "observability",
    "services.semantic_metrics": "observability",
    "services.event_outbox_service": "observability",
    "services.db_service": "shared",
}


def domain_for_module(module: str) -> str | None:
    """Map ``app.services.foo`` / ``app.domains.lifecycle.bar`` to a domain name."""
    key = module.removeprefix("app.")
    best: str | None = None
    best_len = -1
    for prefix, domain in MODULE_DOMAIN.items():
        if key == prefix or key.startswith(prefix + "."):
            if len(prefix) > best_len:
                best = domain
                best_len = len(prefix)
    return best


def imported_domain(imported_module: str) -> str | None:
    if not imported_module.startswith("app."):
        return None
    return domain_for_module(imported_module)


def is_import_allowed(owner: str, target: str) -> bool:
    forbidden = FORBIDDEN_IMPORTS.get(owner, frozenset())
    if target in forbidden:
        return False
    allowed = ALLOWED_IMPORTS.get(owner, frozenset())
    return target in allowed
