"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Box, Plus, Loader2 } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRelativeTime, formatApiClientError } from "@/lib/utils"
import { useAppContext } from "@/lib/app-context"
import { createModel, fetchModels } from "@/lib/api"
import { mlairKeys } from "@/lib/query-keys"
import { useToast } from "@/hooks/use-toast"

export default function ModelsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId, projectId, token } = useAppContext()
  const scopePinned = tenantId !== "all" && projectId !== "all"
  const [registerOpen, setRegisterOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const modelsQuery = useQuery({
    queryKey: mlairKeys.models.list(tenantId, projectId),
    queryFn: () => fetchModels(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  })

  const registerMutation = useMutation({
    mutationFn: () =>
      createModel(tenantId, projectId, token, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: async (model) => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.models.list(tenantId, projectId), exact: false })
      toast({ title: "Model registered", description: model.model_id })
      setRegisterOpen(false)
      setName("")
      setDescription("")
      router.push(`/models/${encodeURIComponent(model.model_id)}`)
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Registration failed", description: formatApiClientError(e) })
    },
  })

  const items = modelsQuery.data?.items ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-violet-600/10">
              <Box className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">Models</h1>
              <p className="text-xs text-zinc-500">
                Scope <span className="font-mono text-zinc-400">{tenantId}</span> /{" "}
                <span className="font-mono text-zinc-400">{projectId}</span>
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8 gap-2 bg-violet-600 text-white hover:bg-violet-500"
            disabled={!token.trim() || !scopePinned}
            title={!scopePinned ? "Select a specific tenant and project" : undefined}
            onClick={() => setRegisterOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Register Model
          </Button>
          <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
            <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Register model</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Creates a model registry entry (maintainer role). Import versions from the model detail page.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="fraud-detector"
                    className="border-zinc-800 bg-zinc-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Description (optional)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="border-zinc-800 bg-zinc-900 resize-none"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" className="border-zinc-700" onClick={() => setRegisterOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-violet-600 hover:bg-violet-500"
                  disabled={!name.trim() || registerMutation.isPending}
                  onClick={() => registerMutation.mutate()}
                >
                  {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {modelsQuery.isError ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {formatApiClientError(modelsQuery.error)}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="font-medium text-zinc-500">Name</TableHead>
                <TableHead className="font-medium text-zinc-500">Model ID</TableHead>
                <TableHead className="font-medium text-zinc-500">Description</TableHead>
                <TableHead className="font-medium text-zinc-500">Created</TableHead>
                <TableHead className="font-medium text-zinc-500">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelsQuery.isLoading ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-zinc-500">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                    Loading models…
                  </TableCell>
                </TableRow>
              ) : null}
              {!modelsQuery.isLoading && items.length === 0 ? (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-zinc-500">
                    No models in this scope.
                  </TableCell>
                </TableRow>
              ) : null}
              {items.map((m) => (
                <TableRow key={m.model_id} className="border-zinc-800">
                  <TableCell>
                    <Link
                      href={`/models/${encodeURIComponent(m.model_id)}`}
                      className="text-sm font-medium text-sky-400 hover:underline"
                    >
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">{m.model_id}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-zinc-500">{m.description || "—"}</TableCell>
                  <TableCell className="text-xs text-zinc-500">{formatRelativeTime(m.created_at)}</TableCell>
                  <TableCell className="text-xs text-zinc-500">{formatRelativeTime(m.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
