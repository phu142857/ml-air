"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useAppContext } from "@/lib/app-context";
import { L4ErrorState, L4LoadingState } from "@/components/settings/l4-settings-ui";
import { fetchSystemSettingsCatalog, type EnvCatalogItem } from "@/lib/system-settings-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function layerBadge(layer: EnvCatalogItem["layer"]) {
  const variant =
    layer === "l4" ? "default" : layer === "secret" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="font-mono text-[10px] uppercase">
      {layer}
    </Badge>
  );
}

export function AdminEnvironmentSettings() {
  const { token } = useAppContext();
  const [section, setSection] = useState<string>("all");
  const [layer, setLayer] = useState<string>("all");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["system-settings-catalog"],
    queryFn: () => fetchSystemSettingsCatalog(token),
    enabled: Boolean(token.trim()),
  });

  const filtered = useMemo(() => {
    const items = query.data?.items || [];
    const needle = q.trim().toLowerCase();
    return items.filter((item) => {
      if (section !== "all" && item.section !== section) return false;
      if (layer !== "all" && item.layer !== layer) return false;
      if (!needle) return true;
      return (
        item.key.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        (item.l4_path || "").toLowerCase().includes(needle)
      );
    });
  }, [query.data?.items, section, layer, q]);

  if (query.isLoading) {
    return (
      <SettingsPage>
        <L4LoadingState />
      </SettingsPage>
    );
  }
  if (query.isError) {
    return (
      <SettingsPage error={String((query.error as Error).message)}>
        <L4ErrorState error={query.error} />
      </SettingsPage>
    );
  }
  if (!query.data) return null;

  const counts = query.data.counts;

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Environment"
      />

      <SettingsSection id="summary" title="Coverage" description="How many keys fall into each configuration layer.">
        <div className="flex flex-wrap gap-3 text-sm">
          <span>Total {counts.total}</span>
          <span>L4 {counts.l4}</span>
          <span>Env {counts.env}</span>
          <span>Compose {counts.compose}</span>
          <span>Secret {counts.secret}</span>
        </div>
      </SettingsSection>

      <SettingsSection id="filters" title="Filters">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search key or description"
            className="h-9 font-mono text-sm"
          />
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {query.data.sections.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={layer} onValueChange={setLayer}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Layer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All layers</SelectItem>
              <SelectItem value="l4">l4 (editable)</SelectItem>
              <SelectItem value="env">env</SelectItem>
              <SelectItem value="compose">compose</SelectItem>
              <SelectItem value="secret">secret</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>

      <SettingsSection id="catalog" title={`Catalog (${filtered.length})`}>
        <div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/40 bg-background text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Layer</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Effective</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.key} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{item.key}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
                    {item.l4_path ? (
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.l4_path}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{layerBadge(item.layer)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.source}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs">
                    {item.effective ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {item.editable ? "Editable in Hub" : "Set in .env"}
                    {item.restart_required ? " · restart" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
