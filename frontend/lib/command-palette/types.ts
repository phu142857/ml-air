import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export type CommandPaletteSection =
  | "pinned"
  | "recent"
  | "navigation"
  | "actions"
  | "search"
  | "resources"
  | "appearance"

export type PaletteCommandKind = "nav" | "action" | "appearance"

export interface PaletteCommandDef {
  id: string
  section: Exclude<CommandPaletteSection, "pinned" | "recent" | "search" | "resources">
  kind: PaletteCommandKind
  label: string
  description?: string
  keywords?: string[]
  href?: string
  icon: LucideIcon
  shortcut?: string
  pinnable?: boolean
  visible?: (ctx: { showExecutionNav: boolean }) => boolean
  run?: (ctx: { setTheme: (theme: string) => void; resolvedTheme?: string }) => void
}

export type RecentResourceKind = "run" | "trace" | "pipeline" | "command"

export interface RecentPaletteItem {
  id: string
  kind: RecentResourceKind
  commandId?: string
  label: string
  sublabel?: string
  href?: string
  traceId?: string
  visitedAt: number
}

export interface PaletteListEntry {
  id: string
  section: CommandPaletteSection
  label: string
  sublabel?: string
  keywords: string
  icon: LucideIcon
  shortcut?: string
  pinnable?: boolean
  pinned?: boolean
  onSelect: () => void
  onPinToggle?: () => void
  trailing?: ReactNode
}

export const SECTION_LABELS: Record<CommandPaletteSection, string> = {
  pinned: "Pinned",
  recent: "Recent",
  navigation: "Navigation",
  actions: "Actions",
  search: "Search",
  resources: "Resources",
  appearance: "Appearance",
}

export const SECTION_ORDER: CommandPaletteSection[] = [
  "pinned",
  "recent",
  "navigation",
  "actions",
  "resources",
  "appearance",
  "search",
]
