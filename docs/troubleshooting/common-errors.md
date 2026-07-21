# Troubleshooting

## Common Errors

- `insufficient_role`: token lacks required role.
- `run_not_found`: wrong scope (`tenant_id` / `project_id`) or invalid `run_id`.
- `plugin_not_found_or_disabled`: plugin not loaded or disabled.
- `mapping_version_stale`: frontend switched scope using an outdated mapping version; call `GET /v1/bootstrap/context` and retry `POST /v1/auth/context/switch`.
- `status=BLOCKED`: pipeline cannot be enqueued due to plugin contract validation failure.
  - `NO_PLUGIN`: a task has no `plugin`
  - `PLUGIN_NOT_FOUND`: the referenced plugin does not exist in the registry
  - `INVALID_TASK`: pipeline/task definition shape is invalid
- `replay_gating_blocked_*`: replay blocked by artifact/checksum/manifest policy.

## Quick Checks

```bash
mlair health
python ./mlair logs <run_id> --limit 200
make test-observability
```

## Related Runbooks

- [Manifest Security Incident Runbook](./manifest-security.md)
- [SLO/SLA and Incident Runbook](./slo-sla-incident.md)
- [Backup and Restore Runbook](./backup-restore.md)
- [Disaster Recovery Checklist](./disaster-recovery.md)
