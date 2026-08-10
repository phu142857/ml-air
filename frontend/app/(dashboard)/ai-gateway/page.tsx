"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Send } from "lucide-react";
import { useState } from "react";

import { ControlPlaneDisabled } from "@/components/mlops/control-plane/disabled-state";
import { MlopsEmptyState, PageScrollBody, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import {
  createGatewayProvider,
  createGatewayRoute,
  fetchGatewayProviders,
  fetchGatewayRoutes,
  gatewayChat,
} from "@/lib/control-plane-api";
import { mlairKeys } from "@/lib/query-keys";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages";
import { useControlPlaneFeatures } from "@/lib/use-control-plane-features";
import { cn, formatApiClientError } from "@/lib/utils";

export default function AiGatewayPage() {
  const { tenantId, projectId, token } = useAppContext();
  const flags = useControlPlaneFeatures();
  const scopePinned = isScopePinned(tenantId, projectId);
  const qc = useQueryClient();

  const [providerType, setProviderType] = useState("ollama");
  const [providerName, setProviderName] = useState("");
  const [providerUrl, setProviderUrl] = useState("http://localhost:11434");
  const [routePattern, setRoutePattern] = useState("*");
  const [routeProviderId, setRouteProviderId] = useState("");
  const [chatModel, setChatModel] = useState("llama3");
  const [chatPrompt, setChatPrompt] = useState("Hello");
  const [chatResult, setChatResult] = useState<string>("");

  const providersQ = useQuery({
    queryKey: mlairKeys.controlPlane.gatewayProviders(tenantId, projectId),
    queryFn: () => fetchGatewayProviders(tenantId, projectId, token),
    enabled: scopePinned && flags.aiGateway,
  });
  const routesQ = useQuery({
    queryKey: mlairKeys.controlPlane.gatewayRoutes(tenantId, projectId),
    queryFn: () => fetchGatewayRoutes(tenantId, projectId, token),
    enabled: scopePinned && flags.aiGateway,
  });

  const createProviderM = useMutation({
    mutationFn: () =>
      createGatewayProvider(tenantId, projectId, token, {
        provider_type: providerType,
        name: providerName || providerType,
        base_url: providerUrl,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mlairKeys.controlPlane.gatewayProviders(tenantId, projectId) }),
  });

  const createRouteM = useMutation({
    mutationFn: () =>
      createGatewayRoute(tenantId, projectId, token, {
        model_pattern: routePattern,
        provider_id: routeProviderId,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: mlairKeys.controlPlane.gatewayRoutes(tenantId, projectId) }),
  });

  const chatM = useMutation({
    mutationFn: () =>
      gatewayChat(tenantId, projectId, token, {
        model: chatModel,
        messages: [{ role: "user", content: chatPrompt }],
      }),
    onSuccess: (data) => setChatResult(JSON.stringify(data, null, 2)),
  });

  if (!flags.aiGateway) {
    return (
      <div className="p-6">
        <ControlPlaneDisabled feature="AI Gateway" envVar="ML_AIR_AI_GATEWAY" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader className="shrink-0" icon={Bot} accent="zinc" title="AI Gateway" />
      <PageScrollBody
        header={!scopePinned ? <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} /> : undefined}
      >
        {!scopePinned ? (
          <MlopsEmptyState icon={Bot} title="Pin a project" description="Configure gateway per tenant/project." />
        ) : (
          <>
            <section className="panel-surface space-y-3 p-3">
              <h2 className="text-sm font-semibold">Providers</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <div><Label className="text-xs">Type</Label><Input value={providerType} onChange={(e) => setProviderType(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Name</Label><Input value={providerName} onChange={(e) => setProviderName(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Base URL</Label><Input value={providerUrl} onChange={(e) => setProviderUrl(e.target.value)} className="h-8 text-xs" /></div>
              </div>
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => createProviderM.mutate()} disabled={createProviderM.isPending}>
                <Plus className="h-3.5 w-3.5" /> Add provider
              </Button>
              {providersQ.isError ? <p className="text-xs text-destructive">{formatApiClientError(providersQ.error)}</p> : null}
              <ul className="text-xs text-muted-foreground space-y-1">
                {(providersQ.data?.items || []).map((p) => (
                  <li key={p.provider_id}>{p.name} · {p.provider_type} · {p.base_url}</li>
                ))}
              </ul>
            </section>

            <section className="panel-surface space-y-3 p-3">
              <h2 className="text-sm font-semibold">Routes</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label className="text-xs">Model pattern</Label><Input value={routePattern} onChange={(e) => setRoutePattern(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Provider ID</Label><Input value={routeProviderId} onChange={(e) => setRouteProviderId(e.target.value)} className="h-8 text-xs" placeholder="paste provider_id" /></div>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => createRouteM.mutate()} disabled={createRouteM.isPending || !routeProviderId}>Add route</Button>
              <ul className="text-xs text-muted-foreground space-y-1">
                {(routesQ.data?.items || []).map((r) => (
                  <li key={r.route_id}>{r.model_pattern} → {r.provider_id}</li>
                ))}
              </ul>
            </section>

            <section className="panel-surface space-y-3 p-3">
              <h2 className="text-sm font-semibold">Chat test</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label className="text-xs">Model</Label><Input value={chatModel} onChange={(e) => setChatModel(e.target.value)} className="h-8 text-xs" /></div>
                <div className="md:col-span-2"><Label className="text-xs">Prompt</Label><Textarea value={chatPrompt} onChange={(e) => setChatPrompt(e.target.value)} className="text-xs min-h-[80px]" /></div>
              </div>
              <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => chatM.mutate()} disabled={chatM.isPending}>
                <Send className={cn("h-3.5 w-3.5", chatM.isPending && "animate-pulse")} /> Send
              </Button>
              {chatResult ? <pre className="panel-surface max-h-64 overflow-auto p-3 text-xs">{chatResult}</pre> : null}
            </section>
          </>
        )}
      </PageScrollBody>
    </div>
  );
}
