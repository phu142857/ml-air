export type NavChordEntry = {
  keys: string
  label: string
  href?: string
  description?: string
}

/** `g` then key — GitHub-style go-to navigation. */
export const NAV_CHORD_ROUTES: Record<string, string> = {
  d: "/dashboard",
  "/": "/search",
  s: "/datasets",
  l: "/lifecycle",
  m: "/models",
  g: "/lineage",
  p: "/pipelines",
  r: "/runs",
  t: "/tasks",
  e: "/traces",
  ",": "/settings/profile",
}

export const KEYBOARD_SHORTCUT_GROUPS: Array<{ title: string; items: NavChordEntry[] }> = [
  {
    title: "Global",
    items: [
      { keys: "⌘K", label: "Command palette" },
      { keys: "?", label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Go to (press g, then key)",
    items: [
      { keys: "g d", label: "Dashboard", href: "/dashboard" },
      { keys: "g /", label: "Search", href: "/search" },
      { keys: "g s", label: "Datasets", href: "/datasets" },
      { keys: "g l", label: "Lifecycle", href: "/lifecycle" },
      { keys: "g m", label: "Models", href: "/models" },
      { keys: "g g", label: "Lineage", href: "/lineage" },
      { keys: "g p", label: "Pipelines", href: "/pipelines" },
      { keys: "g r", label: "Runs", href: "/runs" },
      { keys: "g t", label: "Tasks", href: "/tasks" },
      { keys: "g e", label: "Traces", href: "/traces" },
      { keys: "g ,", label: "Settings", href: "/settings/profile" },
    ],
  },
]

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return Boolean(target.closest("[contenteditable='true'], [role='textbox'], [cmdk-input]"))
}
