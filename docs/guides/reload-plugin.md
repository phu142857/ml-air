# Reload Plugin Registry

## Goal

Reload plugin registry after plugin updates.

## Steps

1. Update plugin source.
2. Restart services.
3. Verify plugin list.

## Command

```bash
make rebuild
curl -sS http://localhost:8080/v1/plugins \
  -H "Authorization: Bearer maintainer-token"
# optional: POST /v1/plugins/reload (maintainer) after registry changes
```

## Result

Updated plugin appears in plugin list and can be used by new runs.

## Done

Proceed to [Integrate App with Plugin](./integrate-app-with-plugin.md).
