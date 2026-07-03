# Production WebSocket (WSS) ingress

Hub realtime uses **`realtime_base_url`** from `GET /v1/runtime-config` (env: `ML_AIR_RUNTIME_REALTIME_BASE_URL`). On **HTTPS** sites the browser requires **`wss://`**, not `ws://`.

## Checklist (fill in your ticket)

| Item | Your value |
| --- | --- |
| Public Hub origin | _e.g. `https://mlair.example.com`_ |
| Realtime public URL | _e.g. `wss://mlair.example.com/realtime`_ |
| Backend service (K8s/Docker) | _e.g. `ml-air-realtime:8001`_ |
| TLS termination | _ingress / load balancer name_ |
| `ML_AIR_RUNTIME_REALTIME_BASE_URL` | _must match browser WSS URL_ |

## Environment

Set on **API** (runtime-config inject) and optionally frontend static bootstrap:

```bash
ML_AIR_RUNTIME_REALTIME_BASE_URL=wss://mlair.example.com/realtime
```

Realtime publish is **always on** in current API/scheduler builds (no disable lever). Hub builds WebSocket path as: `{realtime_base_url}/ws?tenant_id=…&project_id=…&token=…`

## Nginx (example)

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 443 ssl;
  server_name mlair.example.com;

  # ... ssl_certificate ...

  location /realtime/ {
    proxy_pass http://ml-air-realtime:8001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }

  location / {
    proxy_pass http://ml-air-frontend:3000;
  }
}
```

Client `realtime_base_url`: `wss://mlair.example.com/realtime` (no trailing slash before `/ws`).

## Kubernetes / Ingress (sketch)

- One **Ingress** host for Hub (HTTP).
- Path `/realtime` → **Service** `realtime:8001` with `nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"` and WebSocket annotations per your controller docs.
- Or separate host `realtime.mlair.example.com` → `wss://realtime.mlair.example.com`.

## Verify

1. `curl -sS https://mlair.example.com/v1/runtime-config | jq .realtime_base_url` → `wss://…`
2. Browser DevTools → Network → WS → **101 Switching Protocols**
3. `python scripts/verify_execution_realtime.py` against API URL (set `ML_AIR_BASE_URL`); WS check uses `realtime_base_url` from runtime-config

## Related

- [Execution realtime ops](./execution-realtime-ops.md)
- [Sign-off checklist](./signoff-wave0-wave1-phase9.md)
