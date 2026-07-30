"use client";

import { toast } from "@/hooks/use-toast";
import { formatApiClientError } from "@/lib/utils";

type ToastCopyOpts = {
  successTitle?: string;
  successDescription?: string;
  errorTitle?: string;
};

export function toastSuccess(title: string, description?: string) {
  toast({ title, description, className: "toast-success-enter" });
}

export function toastError(title: string, description?: string) {
  toast({ variant: "destructive", title, description });
}

function copyViaExecCommand(value: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "0";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.padding = "0";
  el.style.border = "none";
  el.style.outline = "none";
  el.style.boxShadow = "none";
  el.style.background = "transparent";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  el.setSelectionRange(0, value.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(el);
  }
}

export async function copyWithToast(text: string, opts: ToastCopyOpts = {}): Promise<boolean> {
  const value = String(text || "").trim();
  if (!value) {
    toastError(opts.errorTitle ?? "Nothing to copy");
    return false;
  }

  let ok = false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      ok = true;
    }
  } catch {
    ok = false;
  }

  if (!ok) {
    ok = copyViaExecCommand(value);
  }

  if (ok) {
    toast({
      title: opts.successTitle ?? "Copied",
      description: opts.successDescription,
    });
    return true;
  }

  toastError(opts.errorTitle ?? "Copy failed", "Clipboard permission denied or unavailable.");
  return false;
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
