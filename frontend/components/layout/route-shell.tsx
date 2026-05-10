"use client";

import Link from "next/link";
import { PropsWithChildren } from "react";

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
      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[224px_1fr]">
        <aside className="sticky top-16 h-auto max-h-none border-b border-border bg-muted/80 md:h-[calc(100vh-64px)] md:max-h-[calc(100vh-64px)] md:border-b-0 md:border-r md:overflow-y-auto md:px-3 md:py-4">
          <div className="mb-2 px-3 pt-3 text-overline font-medium uppercase tracking-wide text-muted-foreground md:px-0 md:pt-0">
            Workspace
          </div>
          <nav className="flex flex-row gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:px-0 md:pb-0">
            {navItems.map((item) => {
              const active = activeNav !== "None" && activeNav === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`shrink-0 rounded-md border px-3 py-2 text-left text-body transition-colors md:py-1.5 ${
                    active
                      ? "border-border bg-card text-foreground ring-1 ring-inset ring-primary/35"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {item.key}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-5 md:gap-6">
            <header className="sticky top-16 z-20 -mx-1 rounded-lg border border-border bg-background/95 px-3 py-3 backdrop-blur-sm md:-mx-0">
              <h1 className="text-page font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-0.5 text-body text-muted-foreground">{subtitle}</p>
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
