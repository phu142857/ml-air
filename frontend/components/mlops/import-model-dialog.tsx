"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FolderUp, HardDrive, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SelectDropdown } from "@/components/ui/select-dropdown"
import {
  createModel,
  createModelVersion,
  importModelVersion,
  importModelVersionMany,
  type ModelItem,
} from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useAppContext } from "@/lib/app-context"
import { formatApiClientError } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

export type ImportModelSource = "upload" | "server_path"

export type ImportModelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingModelId?: string
  existingModelName?: string
  onSuccess?: (model: ModelItem) => void
}

const STAGE_OPTIONS = [
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
  { value: "archived", label: "Archived" },
]

const MODEL_EXT = /\.(pkl|onnx|pt|bin|joblib)$/i

function pickModelFile(files: File[]): File | null {
  return files.find((f) => MODEL_EXT.test(f.name)) ?? null
}

export function ImportModelDialog({
  open,
  onOpenChange,
  existingModelId,
  existingModelName,
  onSuccess,
}: ImportModelDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<ImportModelSource>("upload")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [stage, setStage] = useState("staging")
  const [files, setFiles] = useState<File[]>([])
  const [pickFolder, setPickFolder] = useState(false)
  const [artifactUri, setArtifactUri] = useState("")

  const isNewModel = !existingModelId?.trim()

  useEffect(() => {
    if (!open) return
    setSource("upload")
    setStage("staging")
    setFiles([])
    setPickFolder(false)
    setArtifactUri("")
    if (isNewModel) {
      setName("")
      setDescription("")
    }
  }, [open, isNewModel])

  const openFilePicker = (folder: boolean) => {
    setPickFolder(folder)
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      let modelId = existingModelId?.trim() || ""
      let modelRow: ModelItem

      if (isNewModel) {
        modelRow = await createModel(tenantId, projectId, token, {
          name: name.trim(),
          description: description.trim() || null,
        })
        modelId = modelRow.model_id
      } else {
        modelRow = {
          model_id: modelId,
          name: existingModelName || modelId,
          description: null,
          tenant_id: tenantId,
          project_id: projectId,
          created_at: "",
          updated_at: "",
        }
      }

      if (source === "server_path") {
        const uri = artifactUri.trim()
        if (!uri) throw new Error("Artifact path is required")
        await createModelVersion(tenantId, projectId, modelId, token, {
          artifact_uri: uri,
          stage,
        })
        return modelRow
      }

      if (!files.length) throw new Error("Select at least one file or a folder")
      if (files.length === 1) {
        const f = files[0]!
        await importModelVersion(tenantId, projectId, modelId, token, {
          model_file: f,
          stage,
        })
      } else {
        if (!pickModelFile(files)) {
          throw new Error("Include a model file (.pkl, .onnx, .pt, .bin, .joblib)")
        }
        await importModelVersionMany(tenantId, projectId, modelId, token, { files, stage })
      }
      return modelRow
    },
    onSuccess: async (model) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId), exact: false })
      if (model.model_id) {
        await queryClient.invalidateQueries({
          queryKey: mlairKeys.models.versions(tenantId, projectId, model.model_id),
          exact: false,
        })
      }
      toast({
        title: isNewModel ? "Model imported" : "Version imported",
        description: model.model_id,
      })
      onOpenChange(false)
      onSuccess?.(model)
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Import failed", description: formatApiClientError(e) })
    },
  })

  const canSubmit =
    (isNewModel ? Boolean(name.trim()) : true) &&
    (source === "server_path" ? Boolean(artifactUri.trim()) : files.length > 0) &&
    !importMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNewModel ? "Import model from local" : "Import version from local"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isNewModel
              ? "Register a model and v1 from files on your machine, or point at a directory the API can read (file://)."
              : `Add a version to ${existingModelName || existingModelId}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isNewModel ? (
            <>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="fraud-detector"
                  className="border-border bg-background font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Description (optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="resize-none border-border bg-background"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <Label className="text-muted-foreground">Stage</Label>
            <SelectDropdown value={stage} onChange={setStage} options={STAGE_OPTIONS} aria-label="Version stage" />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={source === "upload" ? "default" : "outline"}
              className={
                source === "upload"
                  ? "gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
                  : "gap-1.5 border-border"
              }
              onClick={() => setSource("upload")}
            >
              <FolderUp className="h-3.5 w-3.5" />
              Upload files
            </Button>
            <Button
              type="button"
              size="sm"
              variant={source === "server_path" ? "default" : "outline"}
              className={
                source === "server_path"
                  ? "gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
                  : "gap-1.5 border-border"
              }
              onClick={() => setSource("server_path")}
            >
              <HardDrive className="h-3.5 w-3.5" />
              Server path
            </Button>
          </div>

          {source === "upload" ? (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Model file or folder</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="border-border" onClick={() => openFilePicker(false)}>
                  Choose files
                </Button>
                <Button type="button" size="sm" variant="outline" className="border-border" onClick={() => openFilePicker(true)}>
                  Choose folder
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                multiple={!pickFolder}
                {...(pickFolder ? { webkitdirectory: "", directory: "" } : {})}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <p className="text-xs text-muted-foreground">
                Weights: .pkl, .onnx, .pt, .bin, .joblib. Optional <span className="font-mono">metadata.json</span>.
              </p>
              {files.length > 0 ? (
                <p className="text-xs text-muted-foreground">{files.length} file(s) selected</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Artifact URI (API filesystem)</Label>
              <Input
                value={artifactUri}
                onChange={(e) => setArtifactUri(e.target.value)}
                placeholder="file:///mlair/artifacts/models/..."
                className="border-border bg-background font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Path must exist inside the API container (e.g. under{" "}
                <span className="font-mono">ML_AIR_DEFAULT_MODEL_ARTIFACT_ROOT</span>).
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-violet-600 text-white hover:bg-violet-500 hover:text-white disabled:text-white/90"
            disabled={!canSubmit}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
