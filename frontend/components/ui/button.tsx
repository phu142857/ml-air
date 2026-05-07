"use client";

import { Slot } from "@radix-ui/react-slot";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "secondary" | "ghost" | "danger";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild, variant = "default", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl px-3 py-2 text-body font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
          variant === "default"
            ? "bg-[#3ecf8e] text-[#06281b] hover:bg-[#35b77e]"
            : variant === "secondary"
              ? "border border-border bg-card text-foreground hover:bg-secondary"
              : variant === "danger"
                ? "border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
