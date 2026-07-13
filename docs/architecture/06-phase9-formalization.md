# Phase 9 — Formalization (research track)

**Document ID:** `docs/architecture/06-phase9-formalization.md`  
**Status:** MVP shipped (machine-checked contracts); full proofs **deferred**

---

## Purpose

Close the **non-blocking** research milestone from [signoff-wave0-wave1-phase9](../runbooks/signoff-wave0-wave1-phase9.md): agree what is **operational contract in-repo** vs **future paper-grade work**.

Phase 9 does **not** gate Wave 0/1 deploy or operator sign-off.

---

## Shipped (MVP)

| Area | Artifact | Verify |
|------|----------|--------|
| Formal model (engineering) | [lifecycle-formal-model.md](../concepts/lifecycle-formal-model.md) | Human review |
| Event flow / state machines | [lifecycle-event-flow.md](../concepts/lifecycle-event-flow.md), [lifecycle-state-machines.md](../concepts/lifecycle-state-machines.md) | Human review |
| Realtime envelope v1 | [realtime-event-envelope.md](../api/realtime-event-envelope.md) | `scripts/validate_semantic_event.py` |
| JSON Schema | `api/app/schemas/`, `sdk/schemas/` | `test_semantic_event_type_schema_parity` |
| Readiness contract | [readiness-and-gating.md](../api/readiness-and-gating.md) | `test_lifecycle_invariants` |
| Semantic observability index | `semantic_observability_model.py` | `check_semantic_observability_coverage.py` |
| Documented gaps | [semantic-observability-gaps.md](../guides/semantic-observability-gaps.md) | Coverage script |

**Automated bundle:**

```bash
make verify-phase9-signoff
```

---

## Partial machine checks (not proofs)

- `EventType` enum ↔ JSON Schema `type` enum parity
- Lifecycle invariants (strict dataset pins, readiness dedupe semantics)
- Every `EventType` mapped in observability surfaces or `DOCUMENTED_GAPS`
- Sample fixture validates against v1 schema

---

## Deferred (research backlog)

| Item | Notes |
|------|-------|
| Mathematical entity model + invariants | Symbolic notation beyond engineering tables |
| Lifecycle algebra δ(state, event) | Operational sketch exists; no proof assistant |
| Closed event pre/post beyond v1 tables | Emitter table in formal model doc is normative MVP |
| Formal proofs + observability paper | Separate epic |
| Extra architecture diagrams | Beyond MVP mermaid in formal model |

Track in product/architecture backlog — **do not mix with deploy tickets**.

---

## Product / architecture sign-off (optional)

When closing the research milestone (not production):

- [ ] Product accepts v1 semantic envelope + realtime docs as **operational contract**
- [ ] Product accepts canonical readiness codes as **global metric/API contract**
- [ ] Architecture schedules deferred formal work in separate epic
- [ ] Optional target date for full formal doc: _YYYY-MM-DD_

---

## Related

- [Implementation roadmap](./01-implementation-roadmap.md)
- [Sign-off Wave 0 / 1 / Phase 9](../runbooks/signoff-wave0-wave1-phase9.md)
