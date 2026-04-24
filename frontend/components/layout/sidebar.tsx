"use client";

const NAV_ITEMS = ["Dashboard", "Pipelines", "Runs", "Tasks", "Settings"] as const;
type NavItem = (typeof NAV_ITEMS)[number];

type SidebarProps = {
  activeNav: NavItem;
  onChange: (item: NavItem) => void;
};

export function Sidebar({ activeNav, onChange }: SidebarProps) {
  return (
    <aside className="border-r border-slate-700 bg-bg-muted p-4">
      <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">Navigation</div>
      <div className="space-y-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            onClick={() => onChange(item)}
            className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
              activeNav === item ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
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
