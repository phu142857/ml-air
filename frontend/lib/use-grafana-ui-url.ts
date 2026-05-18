"use client";

import { useEffect, useState } from "react";

import { getRuntimeConfig } from "./runtime-config";

/** Browser-reachable Grafana base URL from ``GET /v1/runtime-config`` → ``observability.grafana_ui_url``. */
export function useGrafanaUiUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const raw = String(getRuntimeConfig()?.observability?.grafana_ui_url || "").trim();
      setUrl(raw || null);
    };
    read();
    window.addEventListener("mlair-runtime-config-updated", read);
    return () => window.removeEventListener("mlair-runtime-config-updated", read);
  }, []);

  return url;
}
