"use client";

import { useEffect, useState } from "react";

import { getRuntimeConfig } from "@/lib/runtime-config";

export type ControlPlaneFeatureFlags = {
  costAwareScheduler: boolean;
  aiGateway: boolean;
  chargeback: boolean;
  promptManagement: boolean;
  policyEngine: boolean;
  copilot: boolean;
};

function readFlags(): ControlPlaneFeatureFlags {
  const f = getRuntimeConfig()?.features ?? {};
  return {
    costAwareScheduler: Boolean(f.cost_aware_scheduler),
    aiGateway: Boolean(f.ai_gateway),
    chargeback: Boolean(f.chargeback),
    promptManagement: Boolean(f.prompt_management),
    policyEngine: Boolean(f.policy_engine),
    copilot: Boolean(f.copilot),
  };
}

export function useControlPlaneFeatures(): ControlPlaneFeatureFlags {
  const [flags, setFlags] = useState<ControlPlaneFeatureFlags>(() => readFlags());

  useEffect(() => {
    const sync = () => setFlags(readFlags());
    sync();
    window.addEventListener("mlair-runtime-config-updated", sync);
    return () => window.removeEventListener("mlair-runtime-config-updated", sync);
  }, []);

  return flags;
}

export function hasAnyControlPlaneSurface(flags: ControlPlaneFeatureFlags): boolean {
  return (
    flags.aiGateway ||
    flags.chargeback ||
    flags.promptManagement ||
    flags.copilot ||
    flags.costAwareScheduler ||
    flags.policyEngine
  );
}
