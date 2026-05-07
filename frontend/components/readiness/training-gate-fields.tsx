"use client";

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
      <label className="text-xs text-slate-400">
        Training mode
        <select
          value={trainingMode}
          onChange={(e) => onTrainingModeChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
        >
          <option value="quick">quick</option>
          <option value="standard">standard</option>
          <option value="full">full</option>
        </select>
      </label>
      <label className="text-xs text-slate-400 md:col-span-2">
        Required rows (input dataset)
        <input
          value={requiredSize}
          onChange={(e) => onRequiredSizeChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200"
        />
      </label>
    </div>
  );
}
