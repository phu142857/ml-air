"use client";

import { useEffect, useState } from "react";

/** Browser-reachable Jaeger UI base URL from ``GET /v1/runtime-config`` → ``observability.jaeger_ui_url`` (injected on ``window.__ML_AIR_RUNTIME_CONFIG__``). */
export function useJaegerUiUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const g = (window as unknown as { __ML_AIR_RUNTIME_CONFIG__?: { observability?: { jaeger_ui_url?: string | null } } })
        .__ML_AIR_RUNTIME_CONFIG__;
      const raw = String(g?.observability?.jaeger_ui_url || "").trim();
      setUrl(raw || null);
    };
    read();
    window.addEventListener("mlair-runtime-config-updated", read);
    return () => window.removeEventListener("mlair-runtime-config-updated", read);
  }, []);

  return url;
}
