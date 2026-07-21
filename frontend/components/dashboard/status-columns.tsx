"use client";

import { Panel } from "@/components/ui/panel";

type Props = {
  success: number;
  failed: number;
  pending: number;
};

export function StatusColumns({ success, failed, pending }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
      <Panel className="sm:col-span-5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Success
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--status-success-fg)]">
            {success}
          </div>
        </div>
      </Panel>

      <Panel className="sm:col-span-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Failed
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--status-failed-fg)]">
            {failed}
          </div>
        </div>
      </Panel>

      <Panel className="sm:col-span-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pending
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--status-pending-fg)]">
            {pending}
          </div>
        </div>
      </Panel>
    </div>
  );
}
