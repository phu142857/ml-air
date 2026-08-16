/**
 * When tenant/project scope changes, resource detail URLs are no longer valid.
 * Map detail routes to their parent list (or neutral hub) for automatic navigation.
 */

export type ScopeChangeRedirect = {
  href: string
  label: string
}

const DETAIL_ROUTE_RULES: Array<{ test: (pathname: string) => boolean; href: string; label: string }> = [
  { test: (p) => /^\/runs\/[^/]+$/.test(p), href: "/runs", label: "Runs" },
  { test: (p) => /^\/tasks\/[^/]+$/.test(p), href: "/tasks", label: "Tasks" },
  { test: (p) => /^\/datasets\/[^/]+$/.test(p), href: "/datasets", label: "Datasets" },
  { test: (p) => /^\/models\/[^/]+$/.test(p), href: "/models", label: "Models" },
  { test: (p) => p === "/pipelines/new", href: "/pipelines", label: "Pipelines" },
  { test: (p) => /^\/pipelines\/[^/]+/.test(p), href: "/pipelines", label: "Pipelines" },
  { test: (p) => /^\/clusters\/[^/]+$/.test(p), href: "/infra", label: "Infrastructure" },
]

const SCOPE_NEUTRAL_PREFIXES = ["/identity", "/settings", "/admin", "/login"]

/** Returns a list-route redirect when `pathname` is a scoped resource detail page. */
export function resolveScopeChangeRedirect(pathname: string): ScopeChangeRedirect | null {
  const path = pathname.split("?")[0] || "/"
  if (SCOPE_NEUTRAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null
  }
  for (const rule of DETAIL_ROUTE_RULES) {
    if (rule.test(path)) {
      return { href: rule.href, label: rule.label }
    }
  }
  return null
}

/** Lineage loads graphs via query params — reset to a clean canvas on scope change. */
export function resolveLineageScopeReset(pathname: string, search: string): ScopeChangeRedirect | null {
  if (pathname !== "/lineage") return null
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  if (!params.get("run") && !params.get("datasetVersion") && !params.get("dataset")) return null
  return { href: "/lineage", label: "Lineage" }
}
