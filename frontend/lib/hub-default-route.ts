/** Hub entry route from API runtime-config (`hub_default_route`). */

export const HUB_DEFAULT_ROUTES = ["datasets", "lifecycle", "dashboard", "models"] as const;

export type HubDefaultRoute = (typeof HUB_DEFAULT_ROUTES)[number];

export function hubDefaultRoutePath(route: HubDefaultRoute): string {
  return `/${route}`;
}

export function resolveHubDefaultRoute(raw?: string | null): HubDefaultRoute {
  const v = String(raw ?? "datasets")
    .trim()
    .toLowerCase();
  if ((HUB_DEFAULT_ROUTES as readonly string[]).includes(v)) {
    return v as HubDefaultRoute;
  }
  return "datasets";
}

export function resolveHubDefaultRouteFromWindow(): HubDefaultRoute {
  if (typeof window === "undefined") return "datasets";
  const g = window as {
    __ML_AIR_RUNTIME_CONFIG__?: { hub_default_route?: string | null };
  };
  return resolveHubDefaultRoute(g.__ML_AIR_RUNTIME_CONFIG__?.hub_default_route);
}
