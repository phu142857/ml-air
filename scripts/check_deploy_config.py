from pathlib import Path
import sys


def fail(msg: str) -> None:
    print(f"[deploy-config-check] {msg}")
    sys.exit(1)


root = Path(__file__).resolve().parents[1]
staging_values = (root / "charts/ml-air/values-staging.yaml").read_text(encoding="utf-8")
production_values = (root / "charts/ml-air/values-production.yaml").read_text(encoding="utf-8")
deploy_wf = (root / ".github/workflows/deploy-helm-staging.yml").read_text(encoding="utf-8")
frontend_template = (root / "charts/ml-air/templates/frontend.yaml").read_text(encoding="utf-8")
scheduler_template = (root / "charts/ml-air/templates/scheduler.yaml").read_text(encoding="utf-8")
executor_template = (root / "charts/ml-air/templates/executor.yaml").read_text(encoding="utf-8")
api_template = (root / "charts/ml-air/templates/api.yaml").read_text(encoding="utf-8")

if "ml-air-staging.example.com" in staging_values:
    fail("ingress.host in values-staging.yaml is still example.com placeholder")

if "change-me-in-staging" in staging_values:
    fail("values-staging.yaml still contains insecure placeholder secret")

if "externalSecret:\n      enabled: true" in staging_values and "sealedSecret:\n      enabled: true" in staging_values:
    fail("values-staging.yaml enables both externalSecret and sealedSecret; choose one source")

required_secret_refs = [
    "secrets.KUBE_CONFIG_DATA",
    "secrets.ML_AIR_JWT_HS256_SECRET",
    "secrets.ML_AIR_IDENTITY_JWT_SECRET",
    "secrets.ML_AIR_BOOTSTRAP_ADMIN_PASSWORD",
    "secrets.ML_AIR_SA_SCHEDULER_SECRET",
    "secrets.ML_AIR_SA_EXECUTOR_SECRET",
]
for ref in required_secret_refs:
    if ref not in deploy_wf:
        fail(f"missing required secret reference in deploy workflow: {ref}")

if "--wait --timeout" not in deploy_wf:
    fail("deploy workflow must use helm --wait --timeout for rollout safety")

if "helm rollback" not in deploy_wf:
    fail("deploy workflow must include rollback on failure")
if "kubectl create secret generic ml-air-api-secrets" not in deploy_wf:
    fail("deploy workflow must reconcile the complete staging application secret")

if "containerPort: 3000" not in frontend_template or "targetPort: 3000" not in frontend_template:
    fail("frontend Helm service must target the Next.js container port 3000")

for name, template, required in [
    ("scheduler", scheduler_template, "ML_AIR_SA_SCHEDULER_SECRET"),
    ("executor", executor_template, "ML_AIR_SA_EXECUTOR_SECRET"),
]:
    if required not in template or "ML_AIR_API_BASE_URL" not in template:
        fail(f"{name} Helm deployment must receive API URL and service-account secret")

for required in [
    "ML_AIR_IDENTITY_JWT_SECRET",
    "ML_AIR_BOOTSTRAP_ADMIN_PASSWORD",
    "ML_AIR_SA_SCHEDULER_SECRET",
    "ML_AIR_SA_EXECUTOR_SECRET",
]:
    if required not in api_template:
        fail(f"API Helm deployment is missing required secret env: {required}")

prod_path = root / "charts/ml-air/values-production.yaml"
if not prod_path.is_file():
    fail("missing charts/ml-air/values-production.yaml")
if "externalSecret:\n      enabled: true" not in production_values:
    fail("values-production.yaml must enable externalSecret for production JWT")
if "sealedSecret:\n      enabled: true" in production_values:
    fail("values-production.yaml must not use sealedSecret when externalSecret is production default")
if "runtimeRealtimeBaseUrl:" not in production_values or "wss://" not in production_values:
    fail("values-production.yaml must set api.env.runtimeRealtimeBaseUrl with wss://")
if "ingress:\n  enabled: true" not in production_values or "tls:\n    enabled: true" not in production_values:
    fail("values-production.yaml must enable ingress TLS for WSS")
if "ML_AIR_ENVIRONMENT: production" not in production_values:
    fail("values-production.yaml must explicitly set production environment")
if "ML_AIR_CORS_ALLOWED_ORIGINS:" not in production_values:
    fail("values-production.yaml must explicitly restrict CORS origins")

print("[deploy-config-check] OK")
