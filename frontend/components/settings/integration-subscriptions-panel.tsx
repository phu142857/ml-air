"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/mlops/data-table";
import { MlopsPageError } from "@/components/mlops/layout";
import { SettingsEmptyState, SettingsSection } from "@/components/settings/enterprise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DetailTabList } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import {
  createDomainWebhookSubscription,
  createIntegrationSubscription,
  createNotificationChannel,
  createSemanticWebhookSubscription,
  deleteDomainWebhookSubscription,
  deleteIntegrationSubscription,
  deleteNotificationChannel,
  deleteSemanticWebhookSubscription,
  fetchDomainWebhookSubscriptions,
  fetchIntegrationSubscriptions,
  fetchNotificationChannels,
  fetchSemanticWebhookSubscriptions,
  type DomainWebhookSubscription,
  type IntegrationSubscription,
  type NotificationChannel,
  type SemanticWebhookSubscription,
} from "@/lib/integrations-api";
import { mlairKeys } from "@/lib/query-keys";
import { formatApiClientError } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-actions";

const SUB_TABS = [
  { id: "integrations", label: "Integrations" },
  { id: "semantic", label: "Semantic webhooks" },
  { id: "domain", label: "Domain webhooks" },
  { id: "notifications", label: "Notifications" },
] as const;

const INTEGRATION_TYPES = [
  { value: "generic", label: "Generic HTTP" },
  { value: "mlflow", label: "MLflow" },
  { value: "airflow", label: "Airflow" },
  { value: "slack", label: "Slack" },
];

const CHANNEL_TYPES = [
  { value: "webhook", label: "Webhook" },
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack" },
];

export function IntegrationSubscriptionsPanel() {
  const { tenantId, projectId, token } = useAppContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("integrations");

  const integrationsQ = useQuery({
    queryKey: mlairKeys.integrations.subscriptions(tenantId, projectId),
    queryFn: () => fetchIntegrationSubscriptions(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  });
  const semanticQ = useQuery({
    queryKey: mlairKeys.integrations.semanticWebhooks(tenantId, projectId),
    queryFn: () => fetchSemanticWebhookSubscriptions(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  });
  const domainQ = useQuery({
    queryKey: mlairKeys.integrations.domainWebhooks(tenantId, projectId),
    queryFn: () => fetchDomainWebhookSubscriptions(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  });
  const channelsQ = useQuery({
    queryKey: mlairKeys.integrations.notificationChannels(tenantId, projectId),
    queryFn: () => fetchNotificationChannels(tenantId, projectId, token),
    enabled: Boolean(token?.trim()),
  });

  const [name, setName] = useState("my-integration");
  const [integrationType, setIntegrationType] = useState("generic");
  const [targetUrl, setTargetUrl] = useState("https://hooks.example.com/mlair");
  const [eventActions, setEventActions] = useState("run.created,model.approved");
  const [channelType, setChannelType] = useState("webhook");
  const [channelName, setChannelName] = useState("ops-alerts");

  const parseActions = (raw: string) =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const createIntegrationMutation = useMutation({
    mutationFn: () =>
      createIntegrationSubscription(tenantId, projectId, token, {
        name,
        integration_type: integrationType,
        target_url: targetUrl,
        event_actions: parseActions(eventActions),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.integrations.subscriptions(tenantId, projectId) });
      toastSuccess("Integration subscription created");
    },
    onError: (e) => toastError("Create failed", formatApiClientError(e)),
  });

  const createSemanticMutation = useMutation({
    mutationFn: () =>
      createSemanticWebhookSubscription(tenantId, projectId, token, {
        target_url: targetUrl,
        event_types: parseActions(eventActions),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.integrations.semanticWebhooks(tenantId, projectId) });
      toastSuccess("Semantic webhook created");
    },
    onError: (e) => toastError("Create failed", formatApiClientError(e)),
  });

  const createDomainMutation = useMutation({
    mutationFn: () =>
      createDomainWebhookSubscription(tenantId, projectId, token, {
        target_url: targetUrl,
        event_actions: parseActions(eventActions),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.integrations.domainWebhooks(tenantId, projectId) });
      toastSuccess("Domain webhook created");
    },
    onError: (e) => toastError("Create failed", formatApiClientError(e)),
  });

  const createChannelMutation = useMutation({
    mutationFn: () =>
      createNotificationChannel(tenantId, projectId, token, {
        channel_type: channelType,
        name: channelName,
        config: { url: targetUrl },
        event_actions: parseActions(eventActions),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mlairKeys.integrations.notificationChannels(tenantId, projectId) });
      toastSuccess("Notification channel created");
    },
    onError: (e) => toastError("Create failed", formatApiClientError(e)),
  });

  const integrationColumns: DataTableColumn<IntegrationSubscription>[] = useMemo(
    () => [
      { id: "name", header: "Name", width: 140, cell: (r) => <span className="text-sm">{r.name}</span> },
      { id: "type", header: "Type", width: 100, cell: (r) => <span className="text-xs">{r.integration_type}</span> },
      { id: "url", header: "Target", width: 220, cell: (r) => <span className="font-mono text-xs truncate">{r.target_url}</span> },
      {
        id: "actions",
        header: "",
        width: 80,
        cell: (r) => <DeleteButton onDelete={() => deleteIntegrationSubscription(tenantId, projectId, token, r.subscription_id)} invalidateKey={mlairKeys.integrations.subscriptions(tenantId, projectId)} />,
      },
    ],
    [tenantId, projectId, token],
  );

  const webhookColumns = <T extends { subscription_id: string; target_url: string }>(
    onDelete: (id: string) => Promise<void>,
    invalidateKey: readonly unknown[],
  ): DataTableColumn<T>[] => [
    { id: "url", header: "Target URL", width: 280, cell: (r) => <span className="font-mono text-xs">{r.target_url}</span> },
    {
      id: "del",
      header: "",
      width: 80,
      cell: (r) => <DeleteButton onDelete={() => onDelete(r.subscription_id)} invalidateKey={invalidateKey} />,
    },
  ];

  const channelColumns: DataTableColumn<NotificationChannel>[] = useMemo(
    () => [
      { id: "name", header: "Name", width: 140, cell: (r) => <span className="text-sm">{r.name}</span> },
      { id: "type", header: "Type", width: 100, cell: (r) => <span className="text-xs">{r.channel_type}</span> },
      {
        id: "del",
        header: "",
        width: 80,
        cell: (r) => (
          <DeleteButton
            onDelete={() => deleteNotificationChannel(tenantId, projectId, token, r.channel_id)}
            invalidateKey={mlairKeys.integrations.notificationChannels(tenantId, projectId)}
          />
        ),
      },
    ],
    [tenantId, projectId, token],
  );

  const err = integrationsQ.error || semanticQ.error || domainQ.error || channelsQ.error;

  return (
    <div className="space-y-4">
      {err ? (
        <MlopsPageError title="Failed to load subscriptions" message={formatApiClientError(err)} onRetry={() => {
          void integrationsQ.refetch();
          void semanticQ.refetch();
          void domainQ.refetch();
          void channelsQ.refetch();
        }} />
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <DetailTabList accent="violet" tabs={[...SUB_TABS]} />
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <CreateForm
            onSubmit={() => createIntegrationMutation.mutate()}
            pending={createIntegrationMutation.isPending}
            extra={
              <>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <SelectDropdown value={integrationType} onChange={setIntegrationType} options={INTEGRATION_TYPES} buttonClassName="h-8 text-xs" />
                </div>
              </>
            }
            targetUrl={targetUrl}
            onTargetUrlChange={setTargetUrl}
            eventActions={eventActions}
            onEventActionsChange={setEventActions}
          />
          <SettingsSection title="Active subscriptions">
            {(integrationsQ.data?.items?.length ?? 0) > 0 ? (
              <DataTable columns={integrationColumns} data={integrationsQ.data?.items ?? []} keyExtractor={(r) => r.subscription_id} />
            ) : (
              <SettingsEmptyState title="No integration subscriptions" description="Create one to fan-out audit events to external tools." />
            )}
          </SettingsSection>
        </TabsContent>

        <TabsContent value="semantic" className="mt-4 space-y-4">
          <CreateForm
            onSubmit={() => createSemanticMutation.mutate()}
            pending={createSemanticMutation.isPending}
            targetUrl={targetUrl}
            onTargetUrlChange={setTargetUrl}
            eventActions={eventActions}
            onEventActionsChange={setEventActions}
            actionsLabel="Event types (comma-separated)"
          />
          <SettingsSection title="Semantic webhooks">
            {(semanticQ.data?.items?.length ?? 0) > 0 ? (
              <DataTable
                columns={webhookColumns(
                  (id) => deleteSemanticWebhookSubscription(tenantId, projectId, token, id),
                  mlairKeys.integrations.semanticWebhooks(tenantId, projectId),
                )}
                data={(semanticQ.data?.items ?? []) as SemanticWebhookSubscription[]}
                keyExtractor={(r) => r.subscription_id}
              />
            ) : (
              <SettingsEmptyState title="No semantic webhooks" description="Receive semantic event envelopes over HTTP." />
            )}
          </SettingsSection>
        </TabsContent>

        <TabsContent value="domain" className="mt-4 space-y-4">
          <CreateForm
            onSubmit={() => createDomainMutation.mutate()}
            pending={createDomainMutation.isPending}
            targetUrl={targetUrl}
            onTargetUrlChange={setTargetUrl}
            eventActions={eventActions}
            onEventActionsChange={setEventActions}
            actionsLabel="Event actions (comma-separated)"
          />
          <SettingsSection title="Domain webhooks">
            {(domainQ.data?.items?.length ?? 0) > 0 ? (
              <DataTable
                columns={webhookColumns(
                  (id) => deleteDomainWebhookSubscription(tenantId, projectId, token, id),
                  mlairKeys.integrations.domainWebhooks(tenantId, projectId),
                )}
                data={(domainQ.data?.items ?? []) as DomainWebhookSubscription[]}
                keyExtractor={(r) => r.subscription_id}
              />
            ) : (
              <SettingsEmptyState title="No domain webhooks" description="Subscribe to domain event outbox deliveries." />
            )}
          </SettingsSection>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-4">
          <CreateForm
            onSubmit={() => createChannelMutation.mutate()}
            pending={createChannelMutation.isPending}
            extra={
              <>
                <div className="space-y-1.5">
                  <Label>Channel name</Label>
                  <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label>Channel type</Label>
                  <SelectDropdown value={channelType} onChange={setChannelType} options={CHANNEL_TYPES} buttonClassName="h-8 text-xs" />
                </div>
              </>
            }
            targetUrl={targetUrl}
            onTargetUrlChange={setTargetUrl}
            eventActions={eventActions}
            onEventActionsChange={setEventActions}
            urlLabel="Webhook URL (config.url)"
          />
          <SettingsSection title="Notification channels">
            {(channelsQ.data?.items?.length ?? 0) > 0 ? (
              <DataTable columns={channelColumns} data={channelsQ.data?.items ?? []} keyExtractor={(r) => r.channel_id} />
            ) : (
              <SettingsEmptyState title="No notification channels" description="Route lifecycle alerts to Slack, email, or webhooks." />
            )}
          </SettingsSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateForm({
  onSubmit,
  pending,
  targetUrl,
  onTargetUrlChange,
  eventActions,
  onEventActionsChange,
  extra,
  actionsLabel = "Event filters (comma-separated)",
  urlLabel = "Target URL",
}: {
  onSubmit: () => void;
  pending: boolean;
  targetUrl: string;
  onTargetUrlChange: (v: string) => void;
  eventActions: string;
  onEventActionsChange: (v: string) => void;
  extra?: ReactNode;
  actionsLabel?: string;
  urlLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {extra}
        <div className="space-y-1.5 md:col-span-2">
          <Label>{urlLabel}</Label>
          <Input value={targetUrl} onChange={(e) => onTargetUrlChange(e.target.value)} className="h-8 text-xs font-mono" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>{actionsLabel}</Label>
          <Input value={eventActions} onChange={(e) => onEventActionsChange(e.target.value)} className="h-8 text-xs font-mono" />
        </div>
      </div>
      <Button size="sm" className="mt-3" onClick={onSubmit} disabled={pending}>
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
        Add subscription
      </Button>
    </div>
  );
}

function DeleteButton({
  onDelete,
  invalidateKey,
}: {
  onDelete: () => Promise<void>;
  invalidateKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-destructive"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await onDelete();
          await queryClient.invalidateQueries({ queryKey: invalidateKey });
          toastSuccess("Deleted");
        } catch (e) {
          toastError("Delete failed", formatApiClientError(e));
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
    </Button>
  );
}
