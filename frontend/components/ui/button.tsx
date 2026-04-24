"use client";

import { Slot } from "@radix-ui/react-slot";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "secondary";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild, variant = "default", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          variant === "default"
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "bg-slate-700 text-slate-100 hover:bg-slate-600",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
