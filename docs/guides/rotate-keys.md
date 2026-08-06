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

## Semantic event signing keys

Separate from manifest signing; used when **`ML_AIR_SEMANTIC_EVENT_SIGNING=1`**.

1. Add the new secret to `ML_AIR_SEMANTIC_EVENT_SIGNING_KEYS_JSON` under a new `key_id`.
2. Keep the previous `key_id` in the JSON map so `POST /v1/semantic-events/verify` and subscribers can verify in-flight events.
3. Set `ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID` to the new id and roll API pods.
4. After the verification window, remove the retired id from the JSON map.

## Done

Finalize rollout with [Replay](./replay.md) (manifest validation). Production checklist: [Production maturity](./production-maturity.md).
