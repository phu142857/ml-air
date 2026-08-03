"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function SettingsFormFooter({
  dirty,
  onSave,
  onCancel,
  saving,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  className,
  alwaysShow,
}: {
  dirty: boolean
  onSave: () => void
  onCancel: () => void
  saving?: boolean
  saveLabel?: string
  cancelLabel?: string
  className?: string
  /** When true, always render actions (Save disabled until dirty). */
  alwaysShow?: boolean
}) {
  if (!dirty && !alwaysShow) return null

  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      role="region"
      aria-label="Form actions"
    >
      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 transition-colors duration-150"
          onClick={onCancel}
          disabled={saving}
        >
          {cancelLabel}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="h-8 transition-colors duration-150"
        onClick={onSave}
        disabled={!dirty || saving}
      >
        {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {saveLabel}
      </Button>
    </div>
  )
}
