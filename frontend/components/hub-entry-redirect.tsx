"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { hubDefaultRoutePath, resolveHubDefaultRouteFromWindow } from "@/lib/hub-default-route";

/** Client redirect for `/` using runtime-config `hub_default_route` (Wave 5). */
export function HubEntryRedirect() {
  const router = useRouter();
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      const route = resolveHubDefaultRouteFromWindow();
      router.replace(hubDefaultRoutePath(route));
      setPending(false);
    };
    window.addEventListener("mlair-runtime-config-updated", go);
    const fallback = window.setTimeout(go, 2500);
    return () => {
      window.removeEventListener("mlair-runtime-config-updated", go);
      window.clearTimeout(fallback);
    };
  }, [router]);

  if (!pending) return null;

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground ambient-canvas">
      <div className="bezel-shell rounded-2xl p-1">
        <div className="bezel-inner flex h-14 w-14 items-center justify-center">
          <Loader2
            strokeWidth={1.75}
            className="h-6 w-6 animate-spin text-primary"
          />
        </div>
      </div>
      <p className="text-sm">Opening Hub</p>
    </div>
  );
}
