# Manifest and Lineage

**Document ID:** `docs/governance/03-manifest-and-lineage.md`  
**Series:** 004 Governance Architecture  
**Status:** Frozen v1.0

---

## Purpose

Task manifests prove what ran, with what artifacts, and whether outputs are trustworthy for replay and audit. This document fixes governance rules—not signing algorithm implementation detail (see troubleshooting runbooks).

**Code:** `scheduler/main.py`, `executor/main.py`, manifest key helpers; lineage ingest in API domains.

---

## Manifest signing (L3 secrets + L4 policy)

| Concern | Layer | Source |
|---------|-------|--------|
| Signing keys | **L3** | `ML_AIR_MANIFEST_SIGNING_KEY`, `*_KEYS_JSON`, Ed25519 env |
| Key provider / managed file | **L3** | `ML_AIR_MANIFEST_KEY_PROVIDER`, `ML_AIR_MANIFEST_MANAGED_KEYS_FILE` |
| Strict key lifecycle | **L4** | `features.manifest_strict_key_lifecycle` in `system_settings` |
| Allowed key IDs | **L3** | `ML_AIR_MANIFEST_ALLOWED_KEY_IDS` or managed keys file |

Workers verify manifests on replay paths using the same key material as the API.

---

## Replay governance gates

When initializing replay tasks, the scheduler enforces:

| Gate | Settings / env | Default |
|------|----------------|---------|
| Artifact evidence for skipped upstream | `ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE` (L1 infra) | on |
| Parent checksum evidence | `features.replay_require_checksum` (L4) | on |
| Signed manifest + payload validity | `features.replay_require_signed_manifest` (L4) | on |

Resolved via `app.settings.worker` in scheduler when `api` is on `PYTHONPATH`.

Failed gates mark upstream replay nodes `FAILED` with telemetry reason (`missing_parent_artifact_evidence`, `missing_or_invalid_signed_manifest`, etc.).

---

## Lineage

- Run/task completion records lineage inputs/outputs (plugin context, dataset version pins).
- Implicit dataset head warnings controlled by `features.warn_implicit_dataset_head`.
- Legacy version label behavior: `features.lineage_legacy_default_version_label`.

Lineage **ingest** is execution-owned; governance defines **when** pinned versions are mandatory (see [04-dataset-policy.md](./04-dataset-policy.md)).

---

## Semantic events

Optional signing/validation of realtime semantic envelopes:

| Flag | L4 `features.*` |
|------|-----------------|
| Sign envelopes | `semantic_event_signing` |
| Validate on publish | `semantic_event_validate` |

Signing keys remain L3 (`ML_AIR_SEMANTIC_EVENT_SIGNING_*` when used).

---

## Operator references

- [Manifest security troubleshooting](../troubleshooting/manifest-security.md)
- [Lineage replay v0.3 reference](../troubleshooting/lineage-replay-v03-reference.md)

---

## Non-goals (v1.0)

- Cosign / Sigstore integration
- Cross-tenant manifest trust federation
