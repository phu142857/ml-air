/**
 * Route-level loading UI (Next.js App Router). Shown during segment transitions
 * and initial RSC streaming — avoids a blank flash without blocking the shell.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 bg-background px-6 py-12">
      <div className="w-full max-w-lg space-y-3">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-muted/80" />
        <div className="h-4 max-w-md animate-pulse rounded-lg bg-muted/60" />
        <div className="bezel-shell">
          <div className="bezel-inner h-36 animate-pulse bg-muted/30" />
        </div>
        <p className="text-center text-xs text-muted-foreground">Loading</p>
      </div>
    </div>
  );
}
