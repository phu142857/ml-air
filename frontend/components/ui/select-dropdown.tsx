"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
 * Button + listbox menu (not native &lt;select&gt;). Menu uses fixed positioning so it is not
 * clipped by DetailSection overflow or page scroll containers.
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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);
  const buttonLabel = selected?.label ?? (value ? value : placeholder);

  const syncMenuPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: r.bottom + 4,
      left: r.left,
      minWidth: r.width,
      zIndex: 200,
    });
  };

  useEffect(() => {
    if (!open) return;
    syncMenuPosition();
    const onScrollOrResize = () => syncMenuPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      {open && !disabled && options.length ? (
        <ul
          role="listbox"
          style={menuStyle}
          className={cn(
            "max-h-60 overflow-y-auto rounded-xl border border-border/60 bg-card py-1 shadow-diffused",
            listClassName,
          )}
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
      ) : null}
    </div>
  );
}
