# Slack / Discord lifecycle webhook (optional)

Use `ML_AIR_LIFECYCLE_WEBHOOK_URL` with a Slack Incoming Webhook or Discord webhook URL. Payload is JSON (not Slack-native); use a tiny relay or [n8n](https://n8n.io) to transform.

## Minimal relay (Python)

```python
# relay.py — POST from MLAir → format for Slack
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, os, urllib.request

SLACK_URL = os.environ["SLACK_WEBHOOK_URL"]

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        ev = json.loads(body)
        text = f"*{ev.get('type')}* run `{ev.get('run_id')}` → {ev.get('status')}"
        slack = json.dumps({"text": text}).encode()
        urllib.request.urlopen(urllib.request.Request(SLACK_URL, data=slack, method="POST"), timeout=10)
        self.send_response(204)
        self.end_headers()

HTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
```

Point `ML_AIR_LIFECYCLE_WEBHOOK_URL=http://relay:9000/` at the relay.

## Discord

Discord webhooks accept `{"content": "..."}` — same pattern with `DISCORD_WEBHOOK_URL`.

See [lifecycle-webhook.md](./lifecycle-webhook.md) for payload fields and HMAC verification.
