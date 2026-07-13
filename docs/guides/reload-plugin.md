# Reload Plugin Registry

## Goal

Reload plugin registry after plugin updates.

## Steps

1. Update plugin source.
2. Restart services.
3. Verify plugin list.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
mlair rebuild
API="${ML_AIR_BASE_URL:-http://localhost:8080}"

curl -sS "$API/v1/plugins" \
  -H "Authorization: Bearer $TOKEN"
# optional: POST /v1/plugins/reload (maintainer) after registry changes
```

## Result

Updated plugin appears in plugin list and can be used by new runs.

## Done

Proceed to [Integrate App with Plugin](./integrate-app-with-plugin.md).
