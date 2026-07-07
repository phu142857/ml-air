"use client";

import { useEffect, useState } from "react";

import { getJaegerUiBaseUrl, isJaegerUiConfigured } from "./runtime-config";

/** Browser-reachable Jaeger UI base URL from runtime config (null when only dev fallback applies). */
export function useJaegerUiUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      setUrl(isJaegerUiConfigured() ? getJaegerUiBaseUrl() : null);
    };
    read();
    window.addEventListener("mlair-runtime-config-updated", read);
    return () => window.removeEventListener("mlair-runtime-config-updated", read);
  }, []);

  return url;
}
