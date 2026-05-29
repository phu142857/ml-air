"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  type DetailTabAccent,
  detailTabListClassName,
  detailTabScrollClassName,
  detailTabShellClassName,
  detailTabTriggerClassName,
} from "./detail-tab-styles"

export interface DetailTab {
  id: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

interface DetailTabListProps {
  tabs: DetailTab[]
  accent?: DetailTabAccent
  className?: string
}

/** Tab strip only — must be rendered inside `<Tabs value={…} onValueChange={…}>`. */
export function DetailTabList({ tabs, accent = "sky", className }: DetailTabListProps) {
  return (
    <div className={detailTabShellClassName(className)}>
      <div className={detailTabScrollClassName()}>
        <TabsList className={detailTabListClassName()}>
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              disabled={tab.disabled}
              className={detailTabTriggerClassName(accent)}
            >
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  )
}

interface DetailTabBarProps extends DetailTabListProps {
  value: string
  onValueChange: (value: string) => void
}

/** Self-contained tab control for pages that switch content without `<TabsContent>`. */
export function DetailTabBar({ value, onValueChange, tabs, accent, className }: DetailTabBarProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn("flex shrink-0 flex-col", className)}>
      <DetailTabList tabs={tabs} accent={accent} />
    </Tabs>
  )
}
