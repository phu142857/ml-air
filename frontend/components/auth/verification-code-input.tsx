"use client";

import * as React from "react";

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import {
  filterVerificationValue,
  sanitizeVerificationPaste,
  verificationInputMode,
  verificationPattern,
  type VerificationCodeMode,
} from "@/lib/verification-code";
import { cn } from "@/lib/utils";

export type { VerificationCodeMode };

export type VerificationCodeInputProps = {
  length: number;
  mode?: VerificationCodeMode;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  label?: string;
  error?: string | null;
  success?: boolean;
  className?: string;
  containerClassName?: string;
  "aria-label"?: string;
};

/** Shrink-to-fit cells so longer codes (e.g. 8-char recovery) stay inside narrow forms. */
const slotClassName =
  "h-9 min-h-9 w-full min-w-0 max-w-9 flex-1 basis-0 rounded-md border border-l text-sm font-mono shadow-xs first:rounded-md last:rounded-md sm:h-10 sm:min-h-10 sm:max-w-10";

/** Visual group break for recovery `XXXX-XXXX` (does not add a character to the value). */
function recoverySeparatorIndex(length: number, mode: VerificationCodeMode): number | null {
  if (mode !== "alphanumeric" || length !== 8) return null;
  return 4;
}

export function VerificationCodeInput({
  length,
  mode = "numeric",
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  id,
  label = "Verification code",
  error = null,
  success = false,
  className,
  containerClassName,
  "aria-label": ariaLabel,
}: VerificationCodeInputProps) {
  const labelId = React.useId();
  const errorId = React.useId();
  const resolvedAriaLabel = ariaLabel || label;
  const invalid = Boolean(error);
  const separatorAt = recoverySeparatorIndex(length, mode);

  const handleChange = React.useCallback(
    (next: string) => {
      onChange(filterVerificationValue(next, mode, length));
    },
    [length, mode, onChange],
  );

  const handlePasteTransform = React.useCallback(
    (pasted: string) => sanitizeVerificationPaste(pasted, mode),
    [mode],
  );

  const handleComplete = React.useCallback(
    (completeValue: string) => {
      const filtered = filterVerificationValue(completeValue, mode, length);
      if (filtered.length === length) {
        onComplete?.(filtered);
      }
    },
    [length, mode, onComplete],
  );

  return (
    <div
      className={cn("w-full min-w-0 space-y-1.5", className)}
      data-slot="verification-code-input"
      data-mode={mode}
      data-state={disabled ? "disabled" : invalid ? "error" : success ? "success" : "default"}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : resolvedAriaLabel}
    >
      {label ? (
        <Label id={labelId} htmlFor={id} className={disabled ? "opacity-50" : undefined}>
          {label}
        </Label>
      ) : null}
      <InputOTP
        id={id}
        maxLength={length}
        value={value}
        onChange={handleChange}
        onComplete={handleComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode={verificationInputMode(mode)}
        autoComplete={mode === "numeric" ? "one-time-code" : "off"}
        pattern={verificationPattern(mode)}
        pasteTransformer={handlePasteTransform}
        aria-label={label ? undefined : resolvedAriaLabel}
        aria-labelledby={label ? labelId : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        containerClassName={cn(
          "flex w-full min-w-0 items-center has-disabled:opacity-50",
          containerClassName,
        )}
        className="disabled:cursor-not-allowed"
      >
        <InputOTPGroup className="flex w-full min-w-0 items-center gap-1.5 sm:gap-2">
          {Array.from({ length }, (_, index) => (
            <React.Fragment key={index}>
              {separatorAt === index ? (
                <InputOTPSeparator className="mx-0.5 shrink-0 text-muted-foreground [&_svg]:size-3" />
              ) : null}
              <InputOTPSlot
                index={index}
                className={cn(
                  slotClassName,
                  success && !invalid && "border-emerald-500/60",
                )}
              />
            </React.Fragment>
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
