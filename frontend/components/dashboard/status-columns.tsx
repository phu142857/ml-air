"use client";

type Props = {
  success: number;
  failed: number;
  pending: number;
};

export function StatusColumns({ success, failed, pending }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-center">
          <div className="mb-1 text-2xl font-medium text-[color:var(--status-success-fg)]">{success}</div>
          <div className="text-xs text-zinc-500">SUCCESS</div>
        </div>
      </div>
      
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-center">
          <div className="mb-1 text-2xl font-medium text-[color:var(--status-failed-fg)]">{failed}</div>
          <div className="text-xs text-zinc-500">FAILED</div>
        </div>
      </div>
      
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-center">
          <div className="mb-1 text-2xl font-medium text-[color:var(--status-pending-fg)]">{pending}</div>
          <div className="text-xs text-zinc-500">PENDING</div>
        </div>
      </div>
    </div>
  );
}
