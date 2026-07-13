# Identity sign-off runbook

**Goal:** Satisfy [Identity migration DoD](../iam/11-migration-plan.md) §7 and [security checklist](../iam/12-security-review-checklist.md) in a target environment.

---

## Automated (local / CI)

```bash
mlair health
make verify-identity
make verify-operator-signoff
```

CI (`quickstart-test` job) runs signoff + E2E + container unit tests after `mlair health`.

In container (full DB integration):

```bash
docker exec mlair sh -c 'cd /app/api && PYTHONPATH=/app/api:/app python -m unittest tests.test_identity_unit tests.test_identity_integration -q'
```

---

## Checklist mapping

| Checklist # | Automated | Manual |
|-------------|-----------|--------|
| 1 Human login | `runtime-config.identity_login` | Hub `/login` flow |
| 2 Password storage | — | code review / DB inspect |
| 3 Lockout | integration tests | brute-force probe → `423` |
| 16 Legacy flag | `verify_identity_signoff` contract | `.env` in target env |
| 17 No static tokens | compose scan in script | staging `.env` review |
| 19 Audit coverage | integration tests | Hub Admin → Audit |
| 21 JWT secrets | contract keys present | secret manager per env |

---

## Sign-off record

Copy the table from [signoff-wave0-wave1-phase9.md](./signoff-wave0-wave1-phase9.md) or [iam/12-security-review-checklist.md](../iam/12-security-review-checklist.md) §Sign-off.

| Field | Value |
|-------|-------|
| Environment | _development / staging / production_ |
| `verify_identity_signoff.py` | _date + exit 0_ |
| Integration tests | _date + pass count_ |
| Reviewer | _name_ |

---

## References

- [Login and Identity](../guides/login-and-identity.md)
- [iam/DESIGN-FREEZE.md](../iam/DESIGN-FREEZE.md)
