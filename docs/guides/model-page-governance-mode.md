# Model Page Governance Mode

## Goal

Keep model detail focused on governance (versions, approvals, trigger policy, serving metadata), and move primary training/readiness UX to Dataset Hub.

## Feature flag

Environment variable:

- `NEXT_PUBLIC_MLAIR_MODEL_LIFECYCLE_HUB_UI`

Behavior:

- unset / empty -> enabled (default)
- `true|1|yes` -> enabled
- `false|0|no|off` -> disabled (legacy layout)

## Enabled mode (recommended)

Model page emphasizes:

- model versions and promotion
- approval actions
- trigger policy (`manual|auto_ready|schedule`)
- serving slot metadata (when enabled)

Training/readiness:

- primary CTA points users to Datasets / Dataset Hub
- legacy on-page readiness + CSV flow remains available under "Advanced"

## Disabled mode (legacy)

Model page shows full readiness and training forms directly, including pipeline override checks and CSV upload/train controls.

## Why this mode exists

- avoids orchestration-first UX for routine training
- reduces duplicated readiness forms across pages
- keeps backward compatibility for existing operational flows

## Operator checklist

1. Set env var in `.env` / deployment config.
2. Restart frontend runtime.
3. Verify model page copy and navigation behavior.
4. Confirm advanced legacy block still works for compatibility.
