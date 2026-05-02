"use client";

import { cn } from "@/lib/utils";

type Props = {
  success: number;
  failed: number;
  pending: number;
};

export function StatusColumns({ success, failed, pending }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-center">
          <div className="text-page font-bold text-green-500 mb-1">{success}</div>
          <div className="text-xs text-slate-400">SUCCESS</div>
        </div>
      </div>
      
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-center">
          <div className="text-page font-bold text-red-500 mb-1">{failed}</div>
          <div className="text-xs text-slate-400">FAILED</div>
        </div>
      </div>
      
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-center">
          <div className="text-page font-bold text-amber-500 mb-1">{pending}</div>
          <div className="text-xs text-slate-400">PENDING</div>
        </div>
      </div>
    </div>
  );
}
