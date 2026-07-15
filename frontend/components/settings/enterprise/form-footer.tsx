"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SettingsFormFooter({
  dirty,
  onSave,
  onCancel,
  saving,
  saveLabel = "Save changes",
  className,
}: {
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
  className?: string;
}) {
  if (!dirty) return null;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-5 mt-5 flex items-center justify-end gap-2 border-t border-border/60 bg-card/95 px-5 py-3 backdrop-blur-sm",
        className,
      )}
      role="region"
      aria-label="Unsaved changes"
    >
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button type="button" size="sm" onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {saveLabel}
      </Button>
    </div>
  );
}
