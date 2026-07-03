# Runbook: Execution realtime (Hub sync — Wave 0)

Operators use this checklist after deploy or when the Hub shows **stale runs**, **DAG stuck idle**, or **status only updates after refresh**.

## What “working” means

| Signal | Expected |
| --- | --- |
| `GET /v1/runtime-config` | `features.realtime_enabled` ≠ `false`; `realtime_base_url` set (quickstart: `ws://localhost:8001` or your ingress WSS URL) |
| Realtime process | `GET http://<realtime-host>:8001/healthz` → `{"status":"ok"}` |
| Redis | Publishers and subscriber share the same Redis; channel `mlair.events.{tenant}.{project}` |
| API + scheduler | `MLAIR_REALTIME_ENABLED=true` (default in quickstart) so execution/lifecycle events publish |
| Browser Hub | WebSocket connects (DevTools → Network → WS); if WS fails, **polling still runs** (5s reconnecting / 12s when connected) |

WebSocket is **transport only**; Postgres remains source of truth. See [Execution realtime architecture](../guides/execution-realtime-architecture.md).

## Automated sign-off (local quickstart)

```bash
mlair health                    # stack containers + realtime /healthz
python scripts/verify_execution_realtime.py   # runtime-config + WS handshake + Redis TCP
```

Optional env overrides: `ML_AIR_BASE_URL`, `MLAIR_REALTIME_PORT`, `ML_AIR_TENANT_ID`, `ML_AIR_PROJECT_ID`, `ML_AIR_REALTIME_VERIFY_TOKEN` (default `viewer-token`).

## Manual Hub checklist (2 minutes)

1. Open **Runs** — start or pick an active run; status should advance **without F5** within a few seconds.
2. Open **Run detail** → **Execution graph** — task nodes should match scheduler progress.
3. Open **Pipelines** → pipeline with a recent run — topology/DAG observability updates when tasks move.
4. DevTools → **WS** to `{realtime_base_url}/ws?tenant_id=…&project_id=…&token=…` — state **101** or open + server ping; not stuck pending forever.
5. Kill realtime container briefly — Hub should still drift forward via polling; restore realtime and confirm WS reconnects.

## Configuration (defaults on)

| Layer | Variable | Default / note |
| --- | --- | --- |
| API runtime inject | `ML_AIR_RUNTIME_REALTIME_BASE_URL` | Quickstart: `ws://localhost:8001`; empty → API serves default when realtime enabled |
| Disable publish | `MLAIR_REALTIME_ENABLED` | `false` on API/scheduler only if you intentionally run without push (Hub relies on polling) |
| Frontend build override | `NEXT_PUBLIC_MLAIR_REALTIME_WS` | Optional; runtime-config + host inference usually enough |
| Production ingress | TLS **WSS** | See [production-wss-ingress.md](./production-wss-ingress.md); set `ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://…` |

Static bootstrap file: `frontend/public/mlair-runtime-config.js` ships `realtime_base_url: "ws://localhost:8001"` for generic images.

## Symptom → cause

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Everything stale until F5 | Realtime down **and** API publish off | `mlair health`; set `MLAIR_REALTIME_ENABLED=true`; restart API/scheduler/realtime |
| WS pending / failed | Wrong URL, CORS/mixed content, auth token | Match `ML_AIR_AUTH_TOKENS_JSON` / JWT with Hub token; use **WSS** on HTTPS sites |
| Run list updates, DAG stuck | Task id mismatch (fixed in app) — old build | Upgrade frontend/API; hard refresh |
| Only one tenant/project broken | Scope mismatch on WS query params | Hub `tenantId` / `projectId` must match event scope |
| Events in metrics but not UI | Browser blocked WS; polling should still help | Fix WS URL; check `mlair_realtime_ws_send_errors_total` |

## Related

- [Sign-off checklist (Wave 0 + 1 + Phase 9)](./signoff-wave0-wave1-phase9.md)
- [Realtime service](./realtime-service.md) — metrics, coalesce, Phase 4 streams
- [Readiness v2 cutover](./readiness-v2-cutover.md) — version-centric readiness (Wave 0b)
- [Legacy compatibility sunset](./legacy-compat-sunset.md) — calendar and env levers
