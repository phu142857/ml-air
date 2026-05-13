"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const glassShell = cn(
  "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
  "rounded-xl border backdrop-blur-md text-sm font-medium shadow-sm",
  "transition-all duration-200 ease-out active:scale-[0.98]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
);

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        default: cn(
          glassShell,
          "border-emerald-500/40 bg-emerald-100/60 text-emerald-700",
          "hover:bg-emerald-100/80 hover:border-emerald-500/60 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]",
          "dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-400",
          "dark:hover:bg-emerald-950/30 dark:hover:border-emerald-500/50 dark:hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        ),
        destructive: cn(
          glassShell,
          "border-red-500/40 bg-red-100/60 text-red-700",
          "hover:bg-red-100/80 hover:border-red-500/60 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]",
          "dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-400",
          "dark:hover:bg-red-950/30 dark:hover:border-red-500/50 dark:hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
        ),
        danger: cn(
          glassShell,
          "border-red-500/40 bg-red-100/60 text-red-700",
          "hover:bg-red-100/80 hover:border-red-500/60 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]",
          "dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-400",
          "dark:hover:bg-red-950/30 dark:hover:border-red-500/50 dark:hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
        ),
        outline: cn(
          glassShell,
          "border-yellow-500/40 bg-yellow-100/60 text-yellow-800",
          "hover:bg-yellow-100/80 hover:border-yellow-500/60 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]",
          "dark:border-yellow-500/30 dark:bg-yellow-950/20 dark:text-yellow-400",
          "dark:hover:bg-yellow-950/30 dark:hover:border-yellow-500/50 dark:hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]"
        ),
        secondary: cn(
          glassShell,
          "border-zinc-400/30 bg-zinc-900/5 text-zinc-700",
          "hover:bg-zinc-900/10 hover:border-zinc-400/50 hover:shadow-[0_0_20px_rgba(0,0,0,0.08)]",
          "dark:border-white/20 dark:bg-white/5 dark:text-zinc-100",
          "dark:hover:bg-white/10 dark:hover:border-white/30 dark:hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        ),
        info: cn(
          glassShell,
          "border-sky-500/40 bg-sky-100/60 text-sky-700",
          "hover:bg-sky-100/80 hover:border-sky-500/60 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]",
          "dark:border-sky-500/30 dark:bg-sky-950/20 dark:text-sky-400",
          "dark:hover:bg-sky-950/30 dark:hover:border-sky-500/50 dark:hover:shadow-[0_0_20px_rgba(14,165,233,0.15)]"
        ),
        accent: cn(
          glassShell,
          "border-violet-400/40 bg-violet-100/60 text-violet-700",
          "hover:bg-violet-100/80 hover:border-violet-400/60 hover:shadow-[0_0_20px_rgba(167,139,250,0.2)]",
          "dark:border-violet-400/30 dark:bg-violet-950/20 dark:text-violet-300",
          "dark:hover:bg-violet-950/30 dark:hover:border-violet-400/50 dark:hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]"
        ),
        ghost: cn(
          "rounded-xl border border-transparent bg-transparent shadow-none backdrop-blur-none",
          "text-muted-foreground hover:bg-zinc-900/5 hover:text-foreground",
          "dark:hover:bg-white/5",
          "active:scale-[0.98]"
        ),
        link: cn(
          "rounded-md border-0 bg-transparent p-0 text-primary shadow-none backdrop-blur-none",
          "underline-offset-4 hover:underline active:scale-100"
        )
      },
      size: {
        default: "px-4 py-2",
        sm: "h-8 rounded-lg px-2.5 text-xs",
        lg: "h-11 rounded-xl px-6 text-base",
        icon: "h-9 w-9 p-0"
      }
    },
    compoundVariants: [
      {
        variant: "link",
        size: "default",
        class: "h-auto px-0 py-0"
      },
      {
        variant: "link",
        size: "sm",
        class: "h-auto px-0 py-0 text-xs"
      },
      {
        variant: "link",
        size: "lg",
        class: "h-auto px-0 py-0 text-base"
      },
      {
        variant: "link",
        size: "icon",
        class: "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent hover:bg-accent"
      }
    ],
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  }
);

Button.displayName = "Button";

export { buttonVariants };
