# Contributor Rules — Configuration

**Document ID:** `docs/config/08-contributor-rules.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Purpose

Prevent configuration sprawl. Every PR that introduces or changes configuration must declare which layer (L0–L5) it uses and comply with these rules.

**Effective:** After Package 002 Design Freeze. Enforced in code review; CI gates added during Configuration refactor phase.

---

## Rule 1 — Classify before implement

Every new configuration knob requires a row in the PR description:

| Field | Required |
|-------|----------|
| **Name** | Setting or env key |
| **Layer** | L0 \| L1 \| L2 \| L3 \| L4 \| L5 |
| **Audience** | developer \| operator \| global admin \| tenant admin |
| **Restart required?** | yes \| no |

If classification is unclear, stop and extend Package 002 or the relevant series package (003–005) before coding.

---

## Rule 2 — No new `os.getenv()` in product code

**Forbidden** (after refactor baseline):

```python
os.getenv("ML_AIR_SOME_NEW_FLAG", "1")
```

**Required pattern** (target):

```python
from app.settings import settings
settings.features.dataset_hub_v2  # resolved from L4 → L2 → L1
```

**Exception window:** Identity implementation in flight may add env reads only if listed in `07-deployment-contract.md` groups A–E. Any other env → reject PR.

---

## Rule 3 — `.env.example` cap

- Target **≤ 30** active variables in `.env.example` (see [07-deployment-contract.md](./07-deployment-contract.md)).
- Adding a key to `.env.example` requires:
  1. Layer L3 classification
  2. Update to `07-deployment-contract.md`
  3. `check_env_sync.py` pass

**Forbidden:** adding feature flags, tuning intervals, or policy keys to `.env.example`.

---

## Rule 4 — L4 vs L5 separation

- Global policy → L4 system settings schema (`03-system-runtime-settings.md`)
- Tenant policy → L5 APIs; link Package 004 when relevant
- **Never** add tenant knobs to `GET /v1/runtime-config` without `tenant_id` scoping

---

## Rule 5 — Platform capabilities are not feature flags

**Forbidden** as L4 toggles:

- Identity login on/off
- JWT validation on/off
- Role assignment model on/off

Product modules (UI experiments, optional integrations) may use L4 after ADR.

---

## Rule 6 — Transitional flags expire

Migration flags (e.g. legacy static tokens) must include in PR / ADR:

- **Owner**
- **Removal target** (release or date)
- **Not** documented in target `.env.example`

---

## Rule 7 — Series package gate

Changes affecting execution semantics, governance policy, or deployment topology require the relevant package **Design Freeze** or a new ADR:

| Change type | Package |
|-------------|---------|
| Lease, retry, replay | 003 Execution |
| Promotion, manifest policy | 004 Governance |
| Helm, HA, backup | 005 Deployment |

---

## PR checklist (copy into template)

```markdown
## Configuration impact

- [ ] Layer L_ declared for each new knob
- [ ] No new env in `.env.example` unless L3 groups A–E
- [ ] No `os.getenv` outside settings module
- [ ] L4/L5 not conflated
- [ ] No platform capability feature flag
- [ ] Series package freeze respected (002–005)
```

---

## Reviewer guide

| Signal | Action |
|--------|--------|
| PR adds `ML_AIR_FEATURE_*` | Request L4 schema or reject |
| PR adds tuning to env | Redirect to L1 |
| PR adds tenant policy to env | Redirect to L5 |
| PR adds 5+ env vars | Block until Config package update |
