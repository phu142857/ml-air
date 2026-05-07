# Model Page Governance Mode

## Goal

Keep model detail focused on governance (versions, approvals, trigger policy, serving metadata), and move primary training/readiness UX to Dataset Hub.

## Status

Governance mode is now the default and only product path in frontend UX. Legacy on-page training/readiness controls and on-page dataset upload/train actions were removed from model detail.

## Enabled mode (recommended)

Model page emphasizes:

- model versions and promotion
- approval actions
- trigger policy (`manual|auto_ready|schedule`)
- serving slot metadata (when enabled)

Training/readiness:

- run from Dataset Hub (`/datasets/{dataset_id}`)
- pipeline-level execution controls remain available from Pipeline detail as advanced tooling

## Why this mode exists

- avoids orchestration-first UX for routine training
- reduces duplicated readiness forms across pages
- keeps backward compatibility for existing operational flows

## Operator checklist

1. Restart frontend runtime after deploy.
2. Verify model page has governance sections only (status, trigger policy, versions, approvals).
3. Confirm readiness/training operations are performed from Dataset Hub and not from model detail.
