"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  FLOATING_MENU_ATTR,
  floatingMenuSurfaceClass,
} from "@/lib/floating-menu";
import { useFloatingMenu } from "@/hooks/use-floating-menu";

export type SelectDropdownOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (next: string) => void;
  options: SelectDropdownOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  listClassName?: string;
  id?: string;
  "aria-label"?: string;
};

/**
 * Button + listbox menu (not native &lt;select&gt;). Menu is portaled to document.body with
 * fixed positioning so it is not clipped by DetailSection overflow or backdrop-filter ancestors.
 */
export function SelectDropdown({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "—",
  className,
  buttonClassName,
  listClassName,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { mounted, menuStyle } = useFloatingMenu({
    anchorRef: buttonRef,
    rootRef,
    open,
    setOpen,
  });

  const selected = options.find((o) => o.value === value);
  const buttonLabel = selected?.label ?? (value ? value : placeholder);

  const menu =
    open && !disabled && options.length ? (
      <ul
        role="listbox"
        {...{ [FLOATING_MENU_ATTR]: "" }}
        style={menuStyle}
        className={cn(floatingMenuSurfaceClass, listClassName)}
        onWheel={(e) => e.stopPropagation()}
      >
        {options.map((opt) => (
          <li key={`${opt.value}::${opt.label}`} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={cn(
                "w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted/80",
                opt.value === value ? "bg-muted text-foreground" : "text-foreground",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                if (opt.value !== value) onChange(opt.value);
              }}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className={cn("relative w-full min-w-[12rem]", className)} ref={rootRef}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-2 panel-surface px-3 py-2 text-left text-sm text-foreground disabled:pointer-events-none disabled:opacity-50",
          buttonClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          ▾
        </span>
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
