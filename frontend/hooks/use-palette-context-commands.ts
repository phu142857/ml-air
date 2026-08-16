"use client"

import { useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Copy, FileDiff, GitBranch, Hash, History, Network, Play, User, Users } from "lucide-react"

import type { PaletteListEntry } from "@/lib/command-palette/types"
import { copyWithToast } from "@/lib/toast-actions"

type UsePaletteContextCommandsOptions = {
  closePalette: () => void
  openTrace?: (traceId: string, label?: string) => void
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function pushCopyEntry(
  entries: PaletteListEntry[],
  id: string,
  resourceLabel: string,
  closePalette: () => void,
) {
  entries.push({
    id: `ctx-copy-${resourceLabel.toLowerCase()}-id`,
    section: "context",
    label: `Copy ${resourceLabel} ID`,
    sublabel: id,
    keywords: ["copy", resourceLabel.toLowerCase(), id, "id"].join(" "),
    icon: Copy,
    onSelect: () => {
      void copyWithToast(id, { successTitle: `${resourceLabel} ID copied` })
      closePalette()
    },
  })
}

export function usePaletteContextCommands({
  closePalette,
  openTrace,
}: UsePaletteContextCommandsOptions): PaletteListEntry[] {
  const pathname = usePathname()
  const router = useRouter()

  return useMemo(() => {
    const entries: PaletteListEntry[] = []

    const runMatch = pathname.match(/^\/runs\/([^/]+)$/)
    if (runMatch) {
      const runId = decodeSegment(runMatch[1])
      pushCopyEntry(entries, runId, "Run", closePalette)
      entries.push({
        id: "ctx-run-lineage",
        section: "context",
        label: "Open lineage for this run",
        sublabel: runId,
        keywords: ["lineage", "graph", runId].join(" "),
        icon: Network,
        onSelect: () => {
          router.push(`/lineage?run=${encodeURIComponent(runId)}`)
          closePalette()
        },
      })
    }

    const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/)
    if (taskMatch) {
      pushCopyEntry(entries, decodeSegment(taskMatch[1]), "Task", closePalette)
    }

    const pipelineVersionsMatch = pathname.match(/^\/pipelines\/([^/]+)\/versions$/)
    if (pipelineVersionsMatch) {
      const pipelineId = decodeSegment(pipelineVersionsMatch[1])
      pushCopyEntry(entries, pipelineId, "Pipeline", closePalette)
      entries.push({
        id: "ctx-pipeline-dag",
        section: "context",
        label: "Open pipeline DAG",
        sublabel: pipelineId,
        keywords: ["dag", "pipeline", pipelineId].join(" "),
        icon: GitBranch,
        onSelect: () => {
          router.push(`/pipelines/${encodeURIComponent(pipelineId)}`)
          closePalette()
        },
      })
      entries.push({
        id: "ctx-pipeline-diff",
        section: "context",
        label: "Open config diff",
        sublabel: pipelineId,
        keywords: ["diff", "compare", pipelineId].join(" "),
        icon: FileDiff,
        onSelect: () => {
          router.push(`/pipelines/${encodeURIComponent(pipelineId)}/diff`)
          closePalette()
        },
      })
    }

    const pipelineDiffMatch = pathname.match(/^\/pipelines\/([^/]+)\/diff$/)
    if (pipelineDiffMatch) {
      const pipelineId = decodeSegment(pipelineDiffMatch[1])
      pushCopyEntry(entries, pipelineId, "Pipeline", closePalette)
      entries.push({
        id: "ctx-pipeline-versions-from-diff",
        section: "context",
        label: "Back to pipeline versions",
        sublabel: pipelineId,
        keywords: ["versions", "history", pipelineId].join(" "),
        icon: History,
        onSelect: () => {
          router.push(`/pipelines/${encodeURIComponent(pipelineId)}/versions`)
          closePalette()
        },
      })
    }

    const pipelineMatch = pathname.match(/^\/pipelines\/([^/]+)$/)
    if (pipelineMatch) {
      const pipelineId = decodeSegment(pipelineMatch[1])
      if (pipelineId === "new") {
        entries.push({
          id: "ctx-pipeline-import-cancel",
          section: "context",
          label: "Back to pipelines list",
          sublabel: "Import wizard",
          keywords: ["pipelines", "import", "cancel", "list"].join(" "),
          icon: GitBranch,
          onSelect: () => {
            router.push("/pipelines")
            closePalette()
          },
        })
      } else {
        pushCopyEntry(entries, pipelineId, "Pipeline", closePalette)
        entries.push({
          id: "ctx-pipeline-versions",
          section: "context",
          label: "Open pipeline versions",
          sublabel: pipelineId,
          keywords: ["versions", "config", pipelineId].join(" "),
          icon: History,
          onSelect: () => {
            router.push(`/pipelines/${encodeURIComponent(pipelineId)}/versions`)
            closePalette()
          },
        })
        entries.push({
          id: "ctx-pipeline-runs",
          section: "context",
          label: "View runs for this pipeline",
          sublabel: pipelineId,
          keywords: ["runs", "execution", pipelineId].join(" "),
          icon: Play,
          onSelect: () => {
            router.push(`/runs?pipeline=${encodeURIComponent(pipelineId)}`)
            closePalette()
          },
        })
      }
    }

    const userMatch = pathname.match(/^\/identity\/users\/([^/]+)$/)
    if (userMatch) {
      pushCopyEntry(entries, decodeSegment(userMatch[1]), "User", closePalette)
      entries.push({
        id: "ctx-user-list",
        section: "context",
        label: "Back to users list",
        keywords: ["users", "identity", "list"].join(" "),
        icon: Users,
        onSelect: () => {
          router.push("/identity/users")
          closePalette()
        },
      })
    }

    const saMatch = pathname.match(/^\/identity\/service-accounts\/([^/]+)$/)
    if (saMatch) {
      pushCopyEntry(entries, decodeSegment(saMatch[1]), "Service account", closePalette)
      entries.push({
        id: "ctx-sa-list",
        section: "context",
        label: "Back to service accounts",
        keywords: ["service account", "identity", "list"].join(" "),
        icon: User,
        onSelect: () => {
          router.push("/identity/service-accounts")
          closePalette()
        },
      })
    }

    const auditMatch = pathname.match(/^\/identity\/audit\/([^/]+)$/)
    if (auditMatch) {
      const eventId = decodeSegment(auditMatch[1])
      pushCopyEntry(entries, eventId, "Audit event", closePalette)
      entries.push({
        id: "ctx-audit-dashboard",
        section: "context",
        label: "Back to audit dashboard",
        keywords: ["audit", "identity", "dashboard"].join(" "),
        icon: History,
        onSelect: () => {
          router.push("/identity/dashboard")
          closePalette()
        },
      })
    }

    const datasetMatch = pathname.match(/^\/datasets\/([^/]+)$/)
    if (datasetMatch) {
      const datasetId = decodeSegment(datasetMatch[1])
      pushCopyEntry(entries, datasetId, "Dataset", closePalette)
      if (typeof window !== "undefined") {
        const datasetVersion = new URLSearchParams(window.location.search).get("datasetVersion")?.trim()
        if (datasetVersion) {
          entries.push({
            id: "ctx-dataset-lineage",
            section: "context",
            label: "Open lineage for dataset version",
            sublabel: datasetVersion,
            keywords: ["lineage", "dataset", datasetVersion].join(" "),
            icon: Network,
            onSelect: () => {
              router.push(`/lineage?datasetVersion=${encodeURIComponent(datasetVersion)}`)
              closePalette()
            },
          })
        }
      }
    }

    const modelMatch = pathname.match(/^\/models\/([^/]+)$/)
    if (modelMatch) {
      pushCopyEntry(entries, decodeSegment(modelMatch[1]), "Model", closePalette)
    }

    const traceMatch = pathname.match(/^\/traces/)
    if (traceMatch && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const traceId = params.get("trace")?.trim()
      if (traceId) {
        entries.push({
          id: "ctx-copy-trace-id",
          section: "context",
          label: "Copy trace ID",
          sublabel: traceId,
          keywords: ["copy", "trace", traceId, "id"].join(" "),
          icon: Hash,
          onSelect: () => {
            void copyWithToast(traceId, { successTitle: "Trace ID copied" })
            closePalette()
          },
        })
        if (openTrace) {
          entries.push({
            id: "ctx-open-trace-dialog",
            section: "context",
            label: "Open trace in dialog",
            sublabel: traceId,
            keywords: ["trace", "explorer", traceId].join(" "),
            icon: Hash,
            onSelect: () => {
              openTrace(traceId, traceId.slice(0, 18))
              closePalette()
            },
          })
        }
      }
    }

    return entries
  }, [pathname, router, closePalette, openTrace])
}
