import { getApiBaseUrl } from "./api";

const API_BASE = getApiBaseUrl();

function headers(token: string): HeadersInit {
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export type IntegrationSubscription = {
  subscription_id: string;
  name: string;
  integration_type: string;
  target_url: string;
  event_actions?: string[] | null;
  enabled: boolean;
  created_at?: string;
};

export type SemanticWebhookSubscription = {
  subscription_id: string;
  target_url: string;
  event_types?: string[] | null;
  enabled: boolean;
  created_at?: string;
};

export type DomainWebhookSubscription = {
  subscription_id: string;
  target_url: string;
  event_actions?: string[] | null;
  enabled: boolean;
  created_at?: string;
};

export type NotificationChannel = {
  channel_id: string;
  channel_type: string;
  name: string;
  config?: Record<string, unknown>;
  event_actions?: string[] | null;
  enabled: boolean;
  created_at?: string;
};

function scoped(tenantId: string, projectId: string) {
  return `${API_BASE}/v1/tenants/${tenantId}/projects/${projectId}`;
}

export async function fetchIntegrationSubscriptions(
  tenantId: string,
  projectId: string,
  token: string,
): Promise<{ items: IntegrationSubscription[] }> {
  const res = await fetch(`${scoped(tenantId, projectId)}/integrations/subscriptions`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: IntegrationSubscription[] };
}

export async function createIntegrationSubscription(
  tenantId: string,
  projectId: string,
  token: string,
  body: {
    name: string;
    integration_type: string;
    target_url: string;
    event_actions?: string[];
    enabled?: boolean;
  },
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/integrations/subscriptions`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as IntegrationSubscription;
}

export async function deleteIntegrationSubscription(
  tenantId: string,
  projectId: string,
  token: string,
  subscriptionId: string,
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/integrations/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchSemanticWebhookSubscriptions(
  tenantId: string,
  projectId: string,
  token: string,
): Promise<{ items: SemanticWebhookSubscription[] }> {
  const res = await fetch(`${scoped(tenantId, projectId)}/webhooks/subscriptions`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: SemanticWebhookSubscription[] };
}

export async function createSemanticWebhookSubscription(
  tenantId: string,
  projectId: string,
  token: string,
  body: { target_url: string; event_types?: string[]; enabled?: boolean },
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/webhooks/subscriptions`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as SemanticWebhookSubscription;
}

export async function deleteSemanticWebhookSubscription(
  tenantId: string,
  projectId: string,
  token: string,
  subscriptionId: string,
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchDomainWebhookSubscriptions(
  tenantId: string,
  projectId: string,
  token: string,
): Promise<{ items: DomainWebhookSubscription[] }> {
  const res = await fetch(`${scoped(tenantId, projectId)}/domain-webhooks/subscriptions`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: DomainWebhookSubscription[] };
}

export async function createDomainWebhookSubscription(
  tenantId: string,
  projectId: string,
  token: string,
  body: { target_url: string; event_actions?: string[]; enabled?: boolean },
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/domain-webhooks/subscriptions`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DomainWebhookSubscription;
}

export async function deleteDomainWebhookSubscription(
  tenantId: string,
  projectId: string,
  token: string,
  subscriptionId: string,
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/domain-webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchNotificationChannels(
  tenantId: string,
  projectId: string,
  token: string,
): Promise<{ items: NotificationChannel[] }> {
  const res = await fetch(`${scoped(tenantId, projectId)}/notifications/channels`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: NotificationChannel[] };
}

export async function createNotificationChannel(
  tenantId: string,
  projectId: string,
  token: string,
  body: { channel_type: string; name: string; config?: Record<string, unknown>; event_actions?: string[]; enabled?: boolean },
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/notifications/channels`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as NotificationChannel;
}

export async function deleteNotificationChannel(
  tenantId: string,
  projectId: string,
  token: string,
  channelId: string,
) {
  const res = await fetch(`${scoped(tenantId, projectId)}/notifications/channels/${encodeURIComponent(channelId)}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(await res.text());
}
