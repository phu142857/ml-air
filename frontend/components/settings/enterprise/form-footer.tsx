"use client"

import { Button } from "@/components/ui/button"
import { FormSaveBar } from "@/components/mlops/layout/form-save-bar"
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"
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
  /** When true, always render actions (Save disabled until dirty). Uses a fixed save bar when dirty. */
  alwaysShow?: boolean
}) {
  useUnsavedChangesGuard(dirty)

  if (dirty) {
    const useFixedBar = Boolean(alwaysShow)

    return (
      <FormSaveBar
        dirty
        saving={saving}
        onSave={onSave}
        onCancel={onCancel}
        saveLabel={saveLabel === "Save" ? "Save changes" : saveLabel}
        cancelLabel={cancelLabel === "Cancel" ? "Discard" : cancelLabel}
        placement={useFixedBar ? "fixed" : "sticky"}
        className={cn(
          useFixedBar && "md:left-[var(--sidebar-width,16rem)]",
          className,
        )}
      />
    )
  }

  if (!alwaysShow) return null

  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      role="region"
      aria-label="Form actions"
    >
      <Button
        type="button"
        size="sm"
        className="h-8 transition-colors duration-150"
        onClick={onSave}
        disabled
      >
        {saveLabel}
      </Button>
    </div>
  )
}
