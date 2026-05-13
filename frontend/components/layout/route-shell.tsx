"use client";

import Link from "next/link";
import { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type NavItem =
  | "Dashboard"
  | "Pipelines"
  | "Runs"
  | "Lineage"
  | "Models"
  | "Datasets"
  | "Tasks"
  | "Settings"
  /** No sidebar highlight (e.g. search overlay route). */
  | "None";

type Props = PropsWithChildren<{
  activeNav: NavItem;
  title: string;
  subtitle: string;
}>;

const navItems: Array<{ key: NavItem; href: string }> = [
  { key: "Dashboard", href: "/dashboard" },
  { key: "Pipelines", href: "/pipelines" },
  { key: "Runs", href: "/runs" },
  { key: "Lineage", href: "/lineage" },
  { key: "Models", href: "/models" },
  { key: "Datasets", href: "/datasets" },
  { key: "Tasks", href: "/tasks" },
  { key: "Settings", href: "/settings" }
];

export function RouteShell({ activeNav, title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="sticky top-16 z-30 h-auto max-h-none border-b border-border bg-muted/40 backdrop-blur-sm md:h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)] md:border-b-0 md:border-r md:overflow-y-auto md:px-3 md:py-5">
          <div className="mb-3 px-3 pt-3 text-overline font-medium uppercase tracking-wide text-muted-foreground md:px-0 md:pt-0">
            Workspace
          </div>
          <nav className="flex flex-row gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:px-0 md:pb-0">
            {navItems.map((item) => {
              const active = activeNav !== "None" && activeNav === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:py-2",
                    active
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  {item.key}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 px-4 py-5 md:px-8 md:py-8">
          <div className="mx-auto flex min-w-0 max-w-[1400px] flex-col gap-6 md:gap-8">
            <header className="sticky top-16 z-20 -mx-1 rounded-xl border border-border bg-card/95 px-4 py-4 shadow-sm backdrop-blur-md md:-mx-0">
              <h1 className="text-page font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1 text-body text-muted-foreground">{subtitle}</p>
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
