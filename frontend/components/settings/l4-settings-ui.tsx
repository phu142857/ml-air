"use client";

import { Loader2 } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import type { SystemSettingsDocument } from "@/lib/system-settings-api";

type L4SaveBarProps = {
  saving: boolean;
  onSave: () => void;
  message?: string;
};

export function L4SaveBar({ saving, onSave, message }: L4SaveBarProps) {
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" disabled={saving} onClick={onSave}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          "Save changes"
        )}
      </Button>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}

export function L4LoadingState() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading platform settings…
    </div>
  );
}

export function L4Meta({ doc }: { doc: SystemSettingsDocument }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        schema v{doc.schema_version}
        {doc.updated_at ? ` · updated ${doc.updated_at}` : ""}
        {doc.updated_by ? ` · by ${doc.updated_by}` : ""}
      </span>
    </div>
  );
}

export function L4ErrorState({ error }: { error: unknown }) {
  return (
    <DetailSection title="Platform settings" description="L4 policy (global admin)." accentBorder="amber">
      <p className="text-sm text-destructive">{String((error as Error)?.message || error)}</p>
    </DetailSection>
  );
}
