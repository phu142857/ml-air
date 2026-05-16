"use client";

import { Input } from "@/components/ui/input";
import type { LifecycleSemanticFilters } from "@/lib/lifecycle-filters";

type Props = {
  filters: LifecycleSemanticFilters;
  onChange: (next: LifecycleSemanticFilters) => void;
  disabled?: boolean;
};

const fieldClass =
  "h-8 border-border bg-card text-xs text-foreground placeholder:text-muted-foreground/80";

export function LifecycleSemanticFiltersBar({ filters, onChange, disabled }: Props) {
  const set = (patch: Partial<LifecycleSemanticFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="policy_id"
        value={filters.policyId ?? ""}
        onChange={(e) => set({ policyId: e.target.value || undefined })}
        className={`w-[9rem] font-mono ${fieldClass}`}
        disabled={disabled}
        aria-label="Filter by policy_id"
      />
      <Input
        placeholder="dataset_version_id"
        value={filters.datasetVersionId ?? ""}
        onChange={(e) => set({ datasetVersionId: e.target.value || undefined })}
        className={`w-[11rem] font-mono ${fieldClass}`}
        disabled={disabled}
        aria-label="Filter by dataset_version_id"
      />
      <Input
        placeholder="readiness_status"
        value={filters.readinessStatus ?? ""}
        onChange={(e) => set({ readinessStatus: e.target.value || undefined })}
        className={`w-[8rem] font-mono ${fieldClass}`}
        disabled={disabled}
        aria-label="Filter by readiness_status"
      />
      <Input
        placeholder="kind (exact)"
        value={filters.kind ?? ""}
        onChange={(e) => set({ kind: e.target.value || undefined })}
        className={`w-[10rem] font-mono ${fieldClass}`}
        disabled={disabled}
        aria-label="Filter by event kind"
      />
      <Input
        placeholder="resource_type"
        value={filters.resourceType ?? ""}
        onChange={(e) => set({ resourceType: e.target.value || undefined })}
        className={`w-[7rem] font-mono ${fieldClass}`}
        disabled={disabled}
        aria-label="Filter by resource_type"
      />
      <Input
        placeholder="resource_id"
        value={filters.resourceId ?? ""}
        onChange={(e) => set({ resourceId: e.target.value || undefined })}
        className={`w-[9rem] font-mono ${fieldClass}`}
        disabled={disabled}
        aria-label="Filter by resource_id"
      />
    </div>
  );
}
