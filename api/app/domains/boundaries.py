"""Import boundary rules for Phase 6 (checked by ``tests/test_import_boundaries.py``)."""

from __future__ import annotations

ALLOWED_IMPORTS: dict[str, frozenset[str]] = {
    "lifecycle": frozenset({"lifecycle", "shared", "observability", "governance"}),
    "orchestration": frozenset({"orchestration", "shared", "lifecycle", "observability", "governance"}),
    "governance": frozenset({"governance", "shared", "lifecycle", "observability"}),
    "observability": frozenset({"observability", "shared", "lifecycle", "orchestration"}),
    "shared": frozenset({"shared"}),
}

FORBIDDEN_IMPORTS: dict[str, frozenset[str]] = {
    "lifecycle": frozenset({"orchestration"}),
}

MODULE_DOMAIN: dict[str, str] = {
    "domains.lifecycle": "lifecycle",
    "domains.orchestration": "orchestration",
    "domains.governance": "governance",
    "domains.observability": "observability",
    "domains.shared": "shared",
}


def domain_for_module(module: str) -> str | None:
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
    if target in FORBIDDEN_IMPORTS.get(owner, frozenset()):
        return False
    return target in ALLOWED_IMPORTS.get(owner, frozenset())
