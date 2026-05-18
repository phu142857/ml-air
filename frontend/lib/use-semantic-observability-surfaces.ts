"use client";

import { useCallback, useEffect, useState } from "react";

import type { SemanticObservabilitySurface } from "./api";
import { getRuntimeConfig } from "./runtime-config";

/** Normalize runtime-config payload (stable for unit tests). */
export function parseSemanticObservabilitySurfaces(raw: unknown): SemanticObservabilitySurface[] {
  return Array.isArray(raw) ? (raw as SemanticObservabilitySurface[]) : [];
}

/** Expand lifecycle “Semantic metrics index” when URL has ``?metrics=1`` (also ``open`` / ``true`` / ``yes``). */
export function shouldOpenLifecycleMetricsIndex(metricsParam: string | null | undefined): boolean {
  const raw = (metricsParam ?? "").trim().toLowerCase();
  return raw === "1" || raw === "open" || raw === "true" || raw === "yes";
}

/** Surfaces index from ``GET /v1/runtime-config`` → ``observability.semantic_observability_surfaces``. */
export function useSemanticObservabilitySurfaces(): SemanticObservabilitySurface[] {
  const read = useCallback((): SemanticObservabilitySurface[] => {
    return parseSemanticObservabilitySurfaces(
      getRuntimeConfig()?.observability?.semantic_observability_surfaces,
    );
  }, []);

  const [surfaces, setSurfaces] = useState<SemanticObservabilitySurface[]>(read);

  useEffect(() => {
    const onUpdate = () => setSurfaces(read());
    onUpdate();
    window.addEventListener("mlair-runtime-config-updated", onUpdate);
    return () => window.removeEventListener("mlair-runtime-config-updated", onUpdate);
  }, [read]);

  return surfaces;
}
