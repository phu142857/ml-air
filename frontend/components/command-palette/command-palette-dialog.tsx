"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"

type CommandPaletteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
}

export function CommandPaletteDialog({
  open,
  onOpenChange,
  title = "Command palette",
  description = "Search, navigate, and run quick actions",
  children,
}: CommandPaletteDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "command-palette-overlay",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "fixed inset-0 z-[var(--z-floating)] bg-black/45 backdrop-blur-[3px]",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "command-palette-surface",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2",
            "fixed top-[min(12vh,5.5rem)] left-1/2 z-[calc(var(--z-floating)+1)]",
            "w-[min(42rem,calc(100%-1.5rem))] -translate-x-1/2 translate-y-0",
            "overflow-hidden duration-200 outline-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
