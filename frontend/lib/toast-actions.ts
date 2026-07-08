"use client";

import { toast } from "@/hooks/use-toast";
import { formatApiClientError } from "@/lib/utils";

type ToastCopyOpts = {
  successTitle?: string;
  successDescription?: string;
  errorTitle?: string;
};

export function toastSuccess(title: string, description?: string) {
  toast({ title, description });
}

export function toastError(title: string, description?: string) {
  toast({ variant: "destructive", title, description });
}

export async function copyWithToast(text: string, opts: ToastCopyOpts = {}): Promise<boolean> {
  const value = String(text || "").trim();
  if (!value) {
    toastError(opts.errorTitle ?? "Nothing to copy");
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast({
      title: opts.successTitle ?? "Copied",
      description: opts.successDescription,
    });
    return true;
  } catch {
    toastError(opts.errorTitle ?? "Copy failed", "Clipboard permission denied or unavailable.");
    return false;
  }
}

export async function runWithToast<T>(
  fn: () => Promise<T>,
  opts: {
    successTitle: string;
    successDescription?: string | ((result: T) => string | undefined);
    errorTitle?: string;
    onSuccess?: (result: T) => void;
  },
): Promise<T | null> {
  try {
    const result = await fn();
    const desc =
      typeof opts.successDescription === "function"
        ? opts.successDescription(result)
        : opts.successDescription;
    toastSuccess(opts.successTitle, desc);
    opts.onSuccess?.(result);
    return result;
  } catch (err) {
    toastError(opts.errorTitle ?? "Action failed", formatApiClientError(err));
    return null;
  }
}
