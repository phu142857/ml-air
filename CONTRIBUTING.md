# Contributing

Thank you for improving MLAir.

## Pull requests

- Keep changes focused on a single concern when possible.
- Run **`make test-env-sync`** after adding or changing environment variables referenced from `deploy/docker-compose.quickstart.yml` (and update both `.env` and `.env.example` in the same change).
- Run smoke and Helm checks when you touch API, scheduler, executor, or chart templates:
  - `make test-smoke-mlair`
  - `make test-helm`
- For larger changes, prefer updating **`openapi-v1-draft.yaml`** and the relevant **`docs/guides/`** page in the same PR so operators stay in sync.

## Local checks

From the repository root (with the stack up if a target requires it):

```bash
make test-env-sync
make test-smoke-mlair
make test-helm
```

## Code style

Match existing patterns in each component (Python services vs Next.js frontend). Avoid drive-by refactors unrelated to the PR goal.
