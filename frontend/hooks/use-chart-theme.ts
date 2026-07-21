"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import {
  getChartAxisStroke,
  getChartGridStroke,
  getChartTooltipStyle,
  getFlowBackgroundColor,
  getFlowEdgeStroke,
} from "@/lib/chart-theme"

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const [, setTick] = useState(0)

  useEffect(() => {
    setTick((n) => n + 1)
  }, [resolvedTheme])

  const flowColorMode = resolvedTheme === "dark" ? ("dark" as const) : ("light" as const)

  return {
    gridStroke: getChartGridStroke(),
    axisStroke: getChartAxisStroke(),
    tooltipStyle: getChartTooltipStyle(),
    flowBackground: getFlowBackgroundColor(),
    flowEdgeStroke: getFlowEdgeStroke(),
    /** @xyflow/react — default is "light", so edges/controls stay light in app dark mode without this. */
    flowColorMode,
  }
}
