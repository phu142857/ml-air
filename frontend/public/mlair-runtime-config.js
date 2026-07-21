// Runtime-injected (deploy-time) frontend config.
//
// How to use in production:
// - Mount/replace this file at container start (volume, configmap, etc.)
// - Keep the frontend image generic; update this file to point to the correct API/Realtime URLs.
//
// This file is loaded before the Next.js app bundle (see `app/layout.tsx`).

window.__ML_AIR_RUNTIME_CONFIG__ = {
  environment: "dev",
  api_base_url: "",
  realtime_base_url: "",
  default_tenant_hint: "default",
  default_project_hint: "default_project",
  hub_default_route: "datasets",
  features: {
    realtime_enabled: true
  }
};

