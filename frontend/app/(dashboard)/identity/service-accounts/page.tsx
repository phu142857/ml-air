"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IdentityStatusBadge,
  SettingsEmptyState,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { createServiceAccount, listServiceAccounts } from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function IdentityServiceAccountsPage() {
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["identity-sa", token],
    queryFn: () => listServiceAccounts(token),
    enabled: Boolean(token?.trim()),
  });

  const createMut = useMutation({
    mutationFn: () => createServiceAccount(token, { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: async (sa) => {
      setOpen(false);
      setName("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["identity-sa"] });
      toast({ title: "Service account created", description: sa.name });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Create service account failed",
        description: formatApiClientError(e),
      });
    },
  });

  const accounts = data || [];

  return (
    <SettingsPage loading={isLoading} error={error ? formatApiClientError(error) : null}>
      <SettingsPageHeader
        title="Service accounts"
        description="Machine identities for workers, schedulers, and SDK automation."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create service account
          </Button>
        }
      />

      <SettingsSection id="directory" title="Directory" description="Non-human principals with scoped API access.">
        {accounts.length === 0 && !isLoading ? (
          <SettingsEmptyState
            title="No service accounts"
            description="Create a service account for pipelines, workers, or integrations."
            actionLabel="Create service account"
            onAction={() => setOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((sa) => (
                  <tr key={sa.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{sa.name}</td>
                    <td className="px-4 py-3">
                      <IdentityStatusBadge state={sa.state} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatWhen(sa.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-8" asChild>
                        <Link href={`/identity/service-accounts/${sa.id}`}>Manage</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create service account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sa-name">Name</Label>
              <Input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-description">Description</Label>
              <Textarea
                id="sa-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-y text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
