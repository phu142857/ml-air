"use client";

import { useEffect, useState } from "react";
import { fetchRuntimeConfig } from "@/lib/api";

/** True when API exposes serving routes (`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`); driven by GET /v1/runtime-config. */
export function useServingSlotsHttpFeature(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rc = await fetchRuntimeConfig({ preferRelative: true });
        if (!cancelled) setEnabled(Boolean(rc.features?.serving_slots_http));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
