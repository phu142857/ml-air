"use client";

import { SelectDropdown } from "@/components/ui/select-dropdown";

const TRAINING_MODE_OPTIONS = [
  { value: "quick", label: "quick" },
  { value: "standard", label: "standard" },
  { value: "full", label: "full" }
];

type Props = {
  trainingMode: string;
  onTrainingModeChange: (value: string) => void;
  requiredSize: string;
  onRequiredSizeChange: (value: string) => void;
  className?: string;
};

/** Shared training_mode + required row threshold controls for readiness / gating flows. */
export function TrainingGateFields({
  trainingMode,
  onTrainingModeChange,
  requiredSize,
  onRequiredSizeChange,
  className = ""
}: Props) {
  return (
    <div className={`grid gap-3 md:grid-cols-4 ${className}`}>
      <label className="text-xs text-muted-foreground">
        Training mode
        <SelectDropdown
          value={trainingMode}
          onChange={onTrainingModeChange}
          options={TRAINING_MODE_OPTIONS}
          className="mt-1"
          buttonClassName="rounded-lg px-2 py-2 text-xs"
          aria-label="Training mode"
        />
      </label>
      <label className="text-xs text-muted-foreground md:col-span-2">
        Required rows (input dataset)
        <input
          value={requiredSize}
          onChange={(e) => onRequiredSizeChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-muted px-2 py-2 text-xs text-foreground"
        />
      </label>
    </div>
  );
}
