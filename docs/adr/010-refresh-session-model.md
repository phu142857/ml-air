# ADR-010: Refresh Session Model

**Status:** **Accepted**  
**Date:** 2026-07-13  
**Accepted:** 2026-07-13 (Identity Design Freeze v1.0)  
**Deciders:** MLAir IAM / Tech Lead  
**Relates to:** Architecture Freeze, Domain Freeze, Database Freeze, P4 REST

---

## Context

Short-lived Access JWTs need a renewal path without re-entering passwords. Opaque long-lived Hub paste tokens are not the target for humans.

---

## Decision

1. **Access Token:** JWT, short TTL, stateless verification; **not** stored as a session row.  
2. **Refresh Token:** opaque random string; server stores **hash** on `user_sessions`.  
3. **Rotation** on each refresh; revoke one session or all sessions.  
4. Reuse detection may revoke the session family and emit audit.  
5. Service Accounts **do not** use refresh sessions (bearer credential only).

---

## Consequences

- Logout / lockout / admin revoke can fail closed for refresh.  
- Stolen access token window is limited by JWT TTL.  
- Hub must persist refresh securely (exact browser storage policy in P5/impl).

## Out of scope

- Exact TTL numbers (config)  
- Cookie vs localStorage debate (implementation)
