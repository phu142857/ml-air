"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SelectDropdown } from "@/components/ui/select-dropdown"
import { fetchPipelines, triggerPipelineRunWithGating, triggerRun, type RunItem } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { formatApiClientError } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

export type TriggerRunMode = "simple" | "gated"

export type TriggerRunDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select pipeline when opening (e.g. from pipeline detail or URL). */
  defaultPipelineId?: string
  /** `gated` uses POST .../pipelines/{id}/run with execution gates. */
  mode?: TriggerRunMode
  /** Hide pipeline picker (pipeline fixed to `defaultPipelineId`). */
  lockPipeline?: boolean
  onSuccess?: (run: RunItem) => void
}

export function TriggerRunDialog({
  open,
  onOpenChange,
  defaultPipelineId,
  mode = "simple",
  lockPipeline = false,
  onSuccess,
}: TriggerRunDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const [pipelineId, setPipelineId] = useState(defaultPipelineId || "")
  const gated = mode === "gated"

  const pipelinesQuery = useQuery({
    queryKey: mlairKeys.pipelines.list(tenantId, projectId),
    queryFn: () => fetchPipelines(tenantId, projectId, token),
    enabled: Boolean(token?.trim()) && open && !lockPipeline,
  })

  const pipelineOptions = (pipelinesQuery.data?.items ?? []).map((p) => ({
    value: p.pipeline_id,
    label: p.pipeline_id,
  }))

  const effectivePipelineId = (lockPipeline ? defaultPipelineId : pipelineId)?.trim() || ""

  useEffect(() => {
    if (!open) return
    const preferred = defaultPipelineId?.trim()
    if (preferred) {
      setPipelineId(preferred)
      return
    }
    const items = pipelinesQuery.data?.items ?? []
    if (!pipelineId || !items.some((x) => x.pipeline_id === pipelineId)) {
      setPipelineId(items[0]?.pipeline_id ?? "")
    }
  }, [open, pipelinesQuery.data, defaultPipelineId, pipelineId])

  const triggerMutation = useMutation({
    mutationFn: () => {
      const pid = effectivePipelineId
      if (!pid) throw new Error("No pipeline selected")
      if (gated) {
        return triggerPipelineRunWithGating(tenantId, projectId, pid, token, {
          pipeline_id: pid,
          idempotency_key: null,
          priority: "normal",
          max_parallel_tasks: 4,
          training_mode: "standard",
          use_latest_pipeline_version: true,
        })
      }
      return triggerRun(tenantId, projectId, token, {
        pipeline_id: pid,
        idempotency_key: null,
        priority: "normal",
        max_parallel_tasks: 4,
      })
    },
    onSuccess: async (run) => {
      const gatedRun = run as RunItem & { blocked_by_gate?: boolean; readiness?: unknown }
      await queryClient.invalidateQueries({ queryKey: mlairKeys.runs.list(tenantId, projectId), exact: false })
      if (gated) {
        await queryClient.invalidateQueries({ queryKey: mlairKeys.pipelines.list(tenantId, projectId), exact: false })
      }
      if (gated && gatedRun.blocked_by_gate) {
        toast({
          variant: "destructive",
          title: "Run blocked by execution gate",
          description: gatedRun.readiness
            ? typeof gatedRun.readiness === "object"
              ? JSON.stringify(gatedRun.readiness).slice(0, 400)
              : String(gatedRun.readiness)
            : "Check pipeline readiness and Dataset Hub inputs.",
        })
      } else {
        toast({ title: "Run started", description: `Run ${gatedRun.run_id}` })
      }
      onOpenChange(false)
      onSuccess?.(gatedRun)
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Trigger failed", description: formatApiClientError(e) })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{gated ? "Trigger pipeline (gated)" : "Start a run"}</DialogTitle>
          <DialogDescription className="text-zinc-500">
            {gated
              ? "Starts a run via the pipeline execution gate (readiness / dataset inputs may block)."
              : "POST a new run for the selected pipeline in the current tenant/project."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label className="text-zinc-400">Pipeline</Label>
            {lockPipeline && effectivePipelineId ? (
              <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200">
                {effectivePipelineId}
              </p>
            ) : pipelineOptions.length ? (
              <SelectDropdown
                value={pipelineId}
                onChange={setPipelineId}
                options={pipelineOptions}
                aria-label="Pipeline for new run"
              />
            ) : pipelinesQuery.isLoading ? (
              <p className="text-xs text-zinc-500">Loading pipelines…</p>
            ) : (
              <p className="text-xs text-amber-400">No pipelines found in this scope.</p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 bg-zinc-900"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={gated ? "bg-amber-600 hover:bg-amber-500" : "bg-sky-600 hover:bg-sky-500"}
            disabled={
              !effectivePipelineId ||
              triggerMutation.isPending ||
              (!lockPipeline && !pipelineOptions.length && !pipelinesQuery.isLoading)
            }
            onClick={() => triggerMutation.mutate()}
          >
            {triggerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : gated ? "Trigger" : "Start run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
