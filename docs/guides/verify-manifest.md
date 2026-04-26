# Verify Manifest

## Goal

Verify manifest signature and required artifacts policy.

## Steps

1. Enable strict manifest verification.
2. Run a signed pipeline.
3. Check scheduler and executor logs.

## Command

```bash
export ML_AIR_MANIFEST_VERIFY_SIGNATURE=true
export ML_AIR_MANIFEST_REQUIRED_ARTIFACTS=true
make up
```

## Result

Unsigned or invalid manifests are rejected with explicit validation error.

## Done

Continue with [Rotate Keys](./rotate-keys.md).
