"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  confirmLabel = "Delete permanently",
  confirmText,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  impact?: string[];
  confirmLabel?: string;
  confirmText?: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const requiresMatch = Boolean(confirmText?.trim());
  const canConfirm = !requiresMatch || typed.trim() === confirmText?.trim();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>{description}</p>
              {impact?.length ? (
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {impact.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requiresMatch ? (
          <div className="space-y-2">
            <Label className="text-xs">
              Type <span className="font-mono font-medium text-foreground">{confirmText}</span> to continue
            </Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-9 font-mono text-sm" autoComplete="off" />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!canConfirm || pending} onClick={onConfirm}>
            {pending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
