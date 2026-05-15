import type { SearchResultItem } from "@/lib/api"
import { buildTaskDetailHref } from "@/lib/task-detail-href"

/** Map API search `href` values to Next.js dashboard routes. */
export function normalizeSearchHref(item: SearchResultItem): string {
  if (item.type === "dataset" && item.dataset_id) {
    return `/datasets/${encodeURIComponent(item.dataset_id)}`
  }
  if (item.type === "task" && item.task_id) {
    return buildTaskDetailHref(item.task_id, {
      tenant_id: item.scope_tenant_id,
      project_id: item.scope_project_id,
      run_id: item.run_id,
    })
  }
  if (item.type === "run" && item.run_id) {
    return `/runs/${encodeURIComponent(item.run_id)}`
  }

  const href = String(item.href || "").trim()
  if (!href) return "/dashboard"

  if (href.startsWith("/lineage?")) {
    try {
      const params = new URL(href, "https://mlair.local").searchParams
      const datasetId = params.get("datasetId")
      if (datasetId) return `/datasets/${encodeURIComponent(datasetId)}`
    } catch {
      /* ignore */
    }
  }

  return href
}
