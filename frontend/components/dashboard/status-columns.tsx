"use client";

type Props = {
  success: number;
  failed: number;
  pending: number;
};

export function StatusColumns({ success, failed, pending }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-border bg-muted p-4">
        <div className="text-center">
          <div className="mb-1 text-page font-medium text-[#3ecf8e]">{success}</div>
          <div className="text-xs text-muted-foreground">SUCCESS</div>
        </div>
      </div>
      
      <div className="rounded-xl border border-border bg-muted p-4">
        <div className="text-center">
          <div className="mb-1 text-page font-medium text-red-400">{failed}</div>
          <div className="text-xs text-muted-foreground">FAILED</div>
        </div>
      </div>
      
      <div className="rounded-xl border border-border bg-muted p-4">
        <div className="text-center">
          <div className="mb-1 text-page font-medium text-amber-400">{pending}</div>
          <div className="text-xs text-muted-foreground">PENDING</div>
        </div>
      </div>
    </div>
  );
}
