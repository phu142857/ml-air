"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface FormSaveBarProps {
  dirty: boolean
  saving?: boolean
  onSave: () => void
  onCancel: () => void
  message?: string
  saveLabel?: string
  cancelLabel?: string
  className?: string
  placement?: "sticky" | "fixed"
}

/** Sticky save bar for explicit-save forms (GitHub Settings style). */
export function FormSaveBar({
  dirty,
  saving,
  onSave,
  onCancel,
  message = "You have unsaved changes",
  saveLabel = "Save changes",
  cancelLabel = "Discard",
  className,
  placement = "sticky",
}: FormSaveBarProps) {
  if (!dirty) return null

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className={cn(
        "z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-6",
        placement === "fixed" ? "fixed bottom-0 left-0 right-0" : "sticky bottom-0",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 pressable"
          onClick={onCancel}
          disabled={saving}
        >
          {cancelLabel}
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
