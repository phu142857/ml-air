# Manage sessions

## Goal

Review and revoke browser/API refresh sessions for your account, or (as admin) manage sessions across the organization.

## Your sessions (My Account)

1. Open **My Account → Sessions** (`/settings/sessions`).
2. Review device / IP / last used metadata.
3. Revoke any session that is not current (or revoke others if the UI offers bulk revoke).
4. **Sign out** of this browser via topbar avatar → **Sign out** (revokes the current refresh session).

### API (self)

```bash
# Optional: pass current refresh so the API can mark is_current
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "X-MLAir-Refresh-Token: $REFRESH" \
  "$API/v1/auth/sessions"

curl -sS -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$API/v1/auth/sessions/<session_id>"
```

Logout:

```bash
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}" \
  "$API/v1/auth/logout"

# Revoke all of your refresh sessions
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "$API/v1/auth/logout-all"
```

## Organization sessions (Administration)

Admins open **Administration → Identity → Sessions** (`/identity/sessions`) to revoke sessions for other users or platform-wide during an incident.

Authentication policy (session TTL, lockout, password length) is under **Authentication Policy** (`/identity/settings`, Global Admin) — see Platform Identity settings in the Hub.

## Result

- Stolen or abandoned sessions can be ended without rotating every credential.
- Users keep self-service control; admins retain break-glass revoke.

## Done

- [Login and Identity](./login-and-identity.md)
- [MFA and recovery codes](./mfa-and-recovery-codes.md)
- [Personal Access Tokens](./personal-access-tokens.md)
