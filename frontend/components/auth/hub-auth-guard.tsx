"use client";

import { PropsWithChildren, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppContext } from "@/lib/app-context";

/** Dashboard routes require a bearer token (identity session or legacy dual-run). */
export function HubAuthGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, isBootstrapped } = useAppContext();

  useEffect(() => {
    if (!isBootstrapped) return;
    if (token.trim()) return;
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isBootstrapped, token, pathname, router]);

  if (!token.trim()) {
    if (!isBootstrapped) {
      return (
        <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          Checking session…
        </div>
      );
    }
    return null;
  }

  return <>{children}</>;
}
