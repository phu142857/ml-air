"use client";

import { useEffect, useState } from "react";
import { DetailSection } from "@/components/mlops/layout";
import { getApiBaseUrl } from "@/lib/api";
import { getRuntimeConfig } from "@/lib/runtime-config";

export default function SettingsAboutPage() {
  const [env, setEnv] = useState("—");
  const [apiBase, setApiBase] = useState("—");

  useEffect(() => {
    setApiBase(getApiBaseUrl());
    const cfg = getRuntimeConfig();
    setEnv(String(cfg?.environment || "unknown"));
  }, []);

  return (
    <DetailSection title="About MLAir" description="Version and deployment information." accentBorder="none">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Product</dt>
          <dd>ML-Air Hub (control plane)</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Environment</dt>
          <dd className="font-mono">{env}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">API</dt>
          <dd className="font-mono text-xs">{apiBase}/v1</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Frontend</dt>
          <dd className="font-mono text-xs">Next.js Hub UI</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">License</dt>
          <dd>See repository LICENSE</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Documentation</dt>
          <dd>
            <a href="https://github.com" className="text-primary hover:underline" rel="noreferrer">
              docs/guides
            </a>
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-[10px] text-muted-foreground">
        Build and commit metadata are injected at deploy time via runtime config in production images.
      </p>
    </DetailSection>
  );
}
