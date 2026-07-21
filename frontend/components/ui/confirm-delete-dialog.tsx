"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

export type ConfirmDeleteDialogProps = {
  open: boolean;
  title: string;
  body: string;
  onDelete: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  confirmLabel?: string;
};

export function ConfirmDeleteDialog({
  open,
  title,
  body,
  onDelete,
  onCancel,
  isLoading,
  confirmLabel = "Delete"
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onDelete} disabled={isLoading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
