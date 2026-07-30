# Personal Access Tokens (CLI & API)

## Goal

Create a long-lived token for scripts, CI, and the `mlair` CLI without storing your password or interactive MFA session.

## When

- Automating Hub API calls as a **human** user.
- Prefer **service accounts** for scheduler/executor/external workers ([Login and Identity](./login-and-identity.md)).

## Hub

1. Open **My Account → CLI & API** (`/settings/cli`).
2. Create a token with a description and optional expiry.
3. Copy the token **once** when shown — it is not displayed again.
4. Revoke unused tokens from the same page.

## API

```bash
# List (metadata only — no secrets)
curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/auth/pats"

# Create — body: { "description": "ci", "expires_in_days": 90 }
# Response includes token once
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"ci","expires_in_days":90}' \
  "$API/v1/auth/pats"

# Revoke
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN" "$API/v1/auth/pats/<pat_id>"
```

Use the PAT as a Bearer token:

```bash
export ML_AIR_TOKEN="<pat>"
curl -sS -H "Authorization: Bearer $ML_AIR_TOKEN" "$API/v1/auth/me"
```

CLI env (see [CLI commands](../cli/commands.md)): `ML_AIR_TOKEN` or `ML_AIR_TRACKING_TOKEN`.

## Result

- Scripts authenticate without interactive login/MFA each run.
- Compromised tokens can be revoked without changing your password.

## Done

- [Login and Identity](./login-and-identity.md)
- [Manage sessions](./manage-sessions.md)
