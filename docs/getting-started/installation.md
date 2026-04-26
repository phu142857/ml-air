# Installation

## Goal

Install and prepare a local MLAir environment.

## Steps

1. Clone the repository.
2. Copy environment defaults.
3. Run preflight checks.

## Command

```bash
git clone <repo-url>
cd ml-air
cp .env.example .env
make doctor
```

## Result

You should see `doctor` checks pass (warnings are acceptable if non-blocking).
The environment is now ready for pipeline run execution, plugin loading, task processing, and lineage tracking.

## Done

You can continue with [Quickstart](./quickstart.md).
