# ADR-009: Service Account Model

**Status:** **Accepted**  
**Date:** 2026-07-13  
**Accepted:** 2026-07-13 (Identity Design Freeze v1.0)  
**Deciders:** MLAir IAM / Tech Lead  
**Relates to:** Architecture Freeze, Domain Freeze, Database Freeze, P4 REST, `08-service-account-permission-catalog.md`

---

## Context

P0 uses static shared tokens (including human-facing `*-token`) and optional JWT. Machines (workers, scheduler, executor, SDK) need durable credentials without passwords and without inheriting human Maintainer/Viewer roles.

---

## Decision

1. **Service Account** is the only machine Principal kind.  
2. Authorization uses **permissions** (`resource:action` from catalog `08`) **plus** **ScopeBindings** (tenant + ALL/SELECTED projects).  
3. **No effective human role** for SAs.  
4. Credentials: show-once secret, hash at rest; **multiple active credentials allowed** during rotation; per-key and whole-account revoke.  
5. Admin APIs: issue-secret, rotate, revoke (see P4).

---

## Consequences

- Workers keep bearer SA secrets; Hub humans use login.  
- Middleware branch: USER vs SERVICE_ACCOUNT stays clean.  
- Rotation without downtime is possible (overlap keys).  

## Out of scope

- OIDC workload identity  
- Physical DDL (P3 already maps tables)
