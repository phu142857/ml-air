# Production WSS and ingress

## Goal

Configure **browser-reachable WebSocket (WSS)** for Hub realtime so the UI shows **Live** and receives semantic execution events — not polling-only fallback.

Realtime uses path **`/ws`** on the same public origin as the Hub (all-in-one) or a dedicated realtime host (microservices).

## How the Hub discovers the WebSocket URL

Priority (simplified):

1. **`GET /v1/runtime-config`** → `realtime_base_url` (preferred in production).
2. Env **`ML_AIR_RUNTIME_REALTIME_BASE_URL`** on the API (feeds runtime-config).
3. Browser inference from current page origin (dev / all-in-one localhost only).

Set an explicit WSS URL in production — do not rely on inference behind split ingress or CDN.

## All-in-one (single port 8080)

Internal nginx routes `/ws` to the realtime service. External TLS terminates at your reverse proxy.

```nginx
# Example: Caddy / nginx in front of mlair container :8080
location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

Env on the all-in-one container:

```bash
ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://mlair.example.com/ws
```

Quickstart microservices compose uses a separate port by default (`ws://localhost:8001`); production should publish **one browser origin** or set runtime-config explicitly.

## Kubernetes / Helm

`charts/ml-air/values-production.yaml` sets:

```yaml
api:
  env:
    runtimeRealtimeBaseUrl: "wss://mlair.production.internal/ws"
ingress:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

Install with your public host:

```bash
helm upgrade --install ml-air ./charts/ml-air \
  -f charts/ml-air/values-production.yaml \
  --set api.env.runtimeRealtimeBaseUrl=wss://mlair.example.com/ws \
  --set ingress.host=mlair.example.com \
  --set ingress.tls.enabled=true
```

Ensure ingress routes **`/ws`** to the **realtime** service (chart templates under `charts/ml-air/templates/`).

## Verify

```bash
export ML_AIR_BASE_URL=https://mlair.example.com
python scripts/verify_execution_realtime.py
```

Expected:

- `[PASS] runtime-config realtime_base_url=wss://...`
- Realtime health endpoint OK
- Optional WebSocket handshake when credentials provided

All-in-one detection: same host/port for API and WS — script sets `MLAIR_ALLINONE=1` automatically when URLs match.

Manual check in browser:

1. Sign in to Hub.
2. Open DevTools → Network → filter **WS**.
3. Confirm connection to `wss://mlair.example.com/ws?tenant_id=...&project_id=...&token=...`.
4. Realtime indicator shows **Live** (not **Polling** only).

## Common failures

| Symptom | Cause | Fix |
|---------|--------|-----|
| Indicator **Polling**, API works | Empty `realtime_base_url` | Set `ML_AIR_RUNTIME_REALTIME_BASE_URL` |
| WS 401 | Expired or missing token | Re-login; check SA vs user JWT on WS query |
| WS connects then drops | Ingress timeout | Increase proxy read/send timeout (3600s) |
| Mixed content blocked | HTTPS page, `ws://` URL | Use `wss://` in runtime-config |
| Works on API host, not Hub host | Split ingress | Single public origin or correct absolute WSS URL |

## HTTP polling fallback

When WSS is unavailable, Hub falls back to HTTP polling (see [Execution realtime architecture](../guides/execution-realtime-architecture.md)). Production should treat polling as **degraded** — fix WSS rather than accepting stale UI.

## Related

- [Bootstrap and scope sync contract](../guides/bootstrap-and-scope-sync-contract.md) — `runtime-config` schema
- [Realtime event envelope](../api/realtime-event-envelope.md)
- [Production deployment](./production-deployment.md)

## Done

`realtime_base_url` is set, ingress proxies WebSocket upgrades, and `verify_execution_realtime.py` passes.
