from pathlib import Path
import sys


def fail(msg: str) -> None:
    print(f"[deploy-config-check] {msg}")
    sys.exit(1)


root = Path(__file__).resolve().parents[1]
staging_values = (root / "charts/ml-air/values-staging.yaml").read_text(encoding="utf-8")
deploy_wf = (root / ".github/workflows/deploy-helm-staging.yml").read_text(encoding="utf-8")

if "ml-air-staging.example.com" in staging_values:
    fail("ingress.host in values-staging.yaml is still example.com placeholder")

if "change-me-in-staging" in staging_values:
    fail("values-staging.yaml still contains insecure placeholder secret")

if "externalSecret:\n      enabled: true" in staging_values and "sealedSecret:\n      enabled: true" in staging_values:
    fail("values-staging.yaml enables both externalSecret and sealedSecret; choose one source")

if "api.secret.value" not in deploy_wf:
    fail("deploy workflow must set api.secret.value from secret")

required_secret_refs = [
    "secrets.KUBE_CONFIG_DATA",
    "secrets.ML_AIR_JWT_HS256_SECRET",
]
for ref in required_secret_refs:
    if ref not in deploy_wf:
        fail(f"missing required secret reference in deploy workflow: {ref}")

if "--wait --timeout" not in deploy_wf:
    fail("deploy workflow must use helm --wait --timeout for rollout safety")

if "helm rollback" not in deploy_wf:
    fail("deploy workflow must include rollback on failure")

print("[deploy-config-check] OK")
