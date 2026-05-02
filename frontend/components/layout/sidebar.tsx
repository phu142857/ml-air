"use client";

const NAV_ITEMS = ["Dashboard", "Pipelines", "Runs", "Tasks", "Settings"] as const;
type NavItem = (typeof NAV_ITEMS)[number];

type SidebarProps = {
  activeNav: NavItem;
  onChange: (item: NavItem) => void;
};

export function Sidebar({ activeNav, onChange }: SidebarProps) {
  return (
    <aside className="border-r border-border bg-muted p-4">
      <div className="mb-3 text-overline uppercase tracking-wide text-muted-foreground">Navigation</div>
      <div className="space-y-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            onClick={() => onChange(item)}
            className={`w-full rounded-xl border border-transparent px-3 py-2 text-left text-body transition-colors ${
              activeNav === item
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </aside>
  );
}

export type { NavItem };
