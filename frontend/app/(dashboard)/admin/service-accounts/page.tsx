"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus } from "lucide-react";
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
import { PageScrollBody, ResourcePageHeader } from "@/components/mlops/layout";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { createServiceAccount, listServiceAccounts } from "@/lib/identity-admin-api";
import { formatApiClientError } from "@/lib/utils";

export default function AdminServiceAccountsPage() {
  const { token } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-sa", token],
    queryFn: () => listServiceAccounts(token),
    enabled: Boolean(token?.trim()),
  });

  const createMut = useMutation({
    mutationFn: () => createServiceAccount(token, { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: async (sa) => {
      setOpen(false);
      setName("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["admin-sa"] });
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageScrollBody
        variant="workspace"
        header={
          <ResourcePageHeader
            icon={Bot}
            accent="zinc"
            title="Service accounts"
            subtitle="Machine identities (workers, scheduler, SDK)"
            actions={
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Create
              </Button>
            }
          />
        }
      >
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
        <div className="scroll-region min-h-0 flex-1 rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">State</th>
                <th className="px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {(data || []).map((sa) => (
                <tr key={sa.id} className="border-t">
                  <td className="px-3 py-2">{sa.name}</td>
                  <td className="px-3 py-2">{sa.state}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/service-accounts/${sa.id}`} className="text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageScrollBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create service account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
