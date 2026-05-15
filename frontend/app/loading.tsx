/**
 * Route-level loading UI (Next.js App Router). Shown during segment transitions
 * and initial RSC streaming — avoids a blank flash without blocking the shell.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 bg-zinc-950 px-6 py-12">
      <div className="w-full max-w-lg space-y-3">
        <div className="h-7 w-48 animate-pulse rounded-md bg-zinc-800/80" />
        <div className="h-4 max-w-md animate-pulse rounded-md bg-zinc-800/60" />
        <div className="h-36 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
        <p className="text-center text-xs text-zinc-500">Loading…</p>
      </div>
    </div>
  );
}
