"use client";

import Link from "next/link";
import { PropsWithChildren } from "react";
import { useAppContext } from "@/lib/app-context";

export function GlobalAdminRouteGuard({ children }: PropsWithChildren) {
  const { isBootstrapped, isGlobalAdmin } = useAppContext();

  if (!isBootstrapped) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isGlobalAdmin) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">Platform administration requires global admin privileges.</p>
        <Link href="/settings/profile" className="text-sm text-primary hover:underline">
          Back to Settings
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
