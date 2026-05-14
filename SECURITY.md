# Security

## Supported versions

Security fixes are applied to the **default branch** and released via SemVer tags (`v*.*.*`) and published container images. Older tags may not receive backports unless documented in a security advisory.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for undisclosed security problems.

Instead, report privately to the repository maintainers (use GitHub **Security advisories** for this repository if enabled, or contact the organization owners listed on the repo). Include:

- A short description of the issue and its impact
- Steps to reproduce (requests, payloads, versions, deployment mode)
- Whether you believe the issue is actively exploitable in default configurations

We aim to acknowledge reports within a few business days. Critical issues may receive an out-of-band patch release.

## Hardening notes

- Rotate `ML_AIR_JWT_HS256_SECRET`, `ML_AIR_TRACKING_TOKEN`, and worker tokens regularly in production.
- Prefer network policies and ingress TLS termination for any deployment exposing the API or UI.
- Review optional outbound webhooks (`MLAIR_MODEL_PROMOTE_*`) and restrict destinations to trusted services.
- Semantic event webhooks: set **`ML_AIR_WEBHOOK_ALLOWED_HOSTS`** to an explicit hostname allowlist; enable delivery only with **`ML_AIR_SEMANTIC_WEBHOOK_DELIVERY=1`**. Treat stored `secret_hmac` as sensitive (rotate via delete + recreate).
