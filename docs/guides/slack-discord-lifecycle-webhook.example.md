# Slack / Discord lifecycle webhook example

## Phase 1 status

The dedicated `ML_AIR_LIFECYCLE_WEBHOOK_*` helper is **not auto-fired** from run
transitions. For Slack/Discord today, subscribe a semantic webhook to
`training.completed` / `training.failed` (see [Semantic webhook cookbook](./semantic-webhook-cookbook.md))
or use a small relay on the semantic delivery path.

The payload shape below remains the intended contract when the Domain Event
webhook sink reuses `notify_lifecycle_webhook` in Phase 2.

---

## Historical relay sketch

Use a Slack Incoming Webhook or Discord webhook URL behind a tiny relay (payload is JSON, not Slack-native). Tools like [n8n](https://n8n.io) can transform.

Example transform target body for Slack:

```json
{
  "text": "Training completed run_id=… dataset_version_id=…"
}
```

Point a semantic webhook subscription (or Phase 2 lifecycle URL) at `http://relay:9000/`.

Related: [Lifecycle webhook](./lifecycle-webhook.md), [Semantic webhook cookbook](./semantic-webhook-cookbook.md).
