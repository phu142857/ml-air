"use client";

import { useEffect, useState } from "react";

import { getRuntimeConfig } from "@/lib/runtime-config";

export type ProjectionFeatureFlags = {
  projectionsEnabled: boolean;
  dashboardProjectionReads: boolean;
  timelineProjectionReads: boolean;
};

function readProjectionFeatures(): ProjectionFeatureFlags {
  const f = getRuntimeConfig()?.features ?? {};
  return {
    projectionsEnabled: Boolean(f.projections_enabled),
    dashboardProjectionReads: Boolean(f.dashboard_projection_reads),
    timelineProjectionReads: Boolean(f.timeline_projection_reads),
  };
}

/** Runtime-config projection flags (Phase 3). */
export function useProjectionFeatures(): ProjectionFeatureFlags {
  const [flags, setFlags] = useState<ProjectionFeatureFlags>(() => readProjectionFeatures());

  useEffect(() => {
    const sync = () => setFlags(readProjectionFeatures());
    sync();
    window.addEventListener("mlair-runtime-config-updated", sync);
    return () => window.removeEventListener("mlair-runtime-config-updated", sync);
  }, []);

  return flags;
}

export function projectionFeaturesFromRuntime(): ProjectionFeatureFlags {
  return readProjectionFeatures();
}
