# Rotate Keys

## Goal

Rotate manifest signing keys without service downtime.

## Steps

1. Add new key with new `key_id`.
2. Keep old key for verification window.
3. Switch signer to new key and remove old key after rollout.

## Command

```bash
python scripts/day7_gate_check.py
```

## Result

New manifests use new key ID while old runs remain verifiable during transition.
Security replay confirms each pipeline run and task signature, including plugin-origin manifests and lineage-safe verification.

## Done

Finalize rollout with [Replay Security Checks](./replay-security.md).
