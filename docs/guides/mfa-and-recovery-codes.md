# MFA and recovery codes

## Goal

Enable TOTP multi-factor authentication for a Hub user, complete MFA at sign-in, and use or regenerate recovery codes if the authenticator is unavailable.

## When

- After first login (recommended for every human account).
- Before production use of Global Admin or tenant admin accounts.

## Hub: enroll MFA

1. Sign in and open **My Account → Security** (`/settings/security`).
2. Under **Multi-factor authentication**, start enrollment.
3. Scan the QR code (or enter the secret) in an authenticator app (Google Authenticator, 1Password, etc.).
4. Enter the **6-digit** verification code to confirm.
5. Store the displayed **recovery codes** offline. Format is `XXXX-XXXX` (8 hex characters with a hyphen). Each unused code can complete one login challenge.

## Hub: sign in with MFA

1. Enter username and password at `/login`.
2. When MFA is required, enter the current **6-digit authenticator code**, or switch to **Use a recovery code instead**.
3. Successful verify issues the normal access + refresh session.

## Hub: disable or regenerate

- **Disable MFA** from Security (requires an enrolled account).
- **Regenerate recovery codes** from Security when codes are exhausted or compromised (invalidates previous unused codes).

## API

### Status

```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/auth/mfa/status"
```

Returns `enabled`, `method` (`totp` or null), timestamps, and `recovery_codes_remaining`.

### Enroll

```bash
# Start — returns secret + otpauth_url
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "$API/v1/auth/mfa/totp/enroll/start"

# Verify — body: { "secret": "<from start>", "code": "123456" }
# Response includes recovery_codes[] (show once)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"secret":"<secret>","code":"123456"}' \
  "$API/v1/auth/mfa/totp/enroll/verify"
```

### Login challenge

```bash
# After POST /auth/login returns mfa_required + challenge_token:
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"challenge_token":"<challenge_token>","otp_code":"123456"}' \
  "$API/v1/auth/mfa/verify"

# Or recovery:
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"challenge_token":"<challenge_token>","recovery_code":"ABCD-1234"}' \
  "$API/v1/auth/mfa/verify"
```

Recovery codes are normalized server-side (non-alphanumeric stripped, uppercased). Sending `ABCD1234` or `abcd-1234` is equivalent.

### Disable / regenerate

```bash
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "$API/v1/auth/mfa/totp/disable"
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "$API/v1/auth/mfa/recovery-codes/regenerate"
```

## Result

- Password alone is insufficient after MFA is enabled.
- Recovery codes provide break-glass access without the authenticator device.

## Done

- [Login and Identity](./login-and-identity.md)
- [Manage sessions](./manage-sessions.md)
- [Personal Access Tokens](./personal-access-tokens.md)
