"use client";

import Link from "next/link";
import { PropsWithChildren } from "react";
import { useCanSeeAdminNav } from "@/lib/hub-nav-access";
import { useAppContext } from "@/lib/app-context";

export function AdminRouteGuard({ children }: PropsWithChildren) {
  const { isBootstrapped } = useAppContext();
  const canSeeAdmin = useCanSeeAdminNav();

  if (!isBootstrapped) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!canSeeAdmin) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You need tenant admin or global admin privileges to manage identity.
        </p>
        <Link href="/datasets" className="text-sm text-primary hover:underline">
          Back to Hub
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
