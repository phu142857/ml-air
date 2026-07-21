import { describe, expect, it } from "vitest"

import { DEFAULT_DASHBOARD_LAYOUT } from "./default-layout"
import {
  compactLayout,
  layoutItemsOverlap,
  resolveLayoutCollisions,
} from "./layout-collision"

describe("layout-collision", () => {
  it("detects overlap", () => {
    const a = DEFAULT_DASHBOARD_LAYOUT[0]
    const b = { ...DEFAULT_DASHBOARD_LAYOUT[1], x: 2, y: 1, w: 4, h: 3 }
    expect(layoutItemsOverlap(a, b)).toBe(true)
  })

  it("pushes widgets down when one is resized into another", () => {
    const base = DEFAULT_DASHBOARD_LAYOUT.map((item) => ({ ...item }))
    const expanded = base.map((item) =>
      item.id === "active-runs" ? { ...item, w: 8, h: 4 } : item,
    )
    const resolved = resolveLayoutCollisions(expanded, "active-runs")
    const active = resolved.find((item) => item.id === "active-runs")!
    const pipeline = resolved.find((item) => item.id === "pipeline-health")!

    expect(active.w).toBe(8)
    expect(active.h).toBe(4)
    expect(pipeline.y).toBeGreaterThanOrEqual(active.y + active.h)
    expect(layoutItemsOverlap(active, pipeline)).toBe(false)
  })

  it("compacts layout without overlaps", () => {
    const messy = DEFAULT_DASHBOARD_LAYOUT.map((item, index) => ({
      ...item,
      x: 0,
      y: index * 2,
      w: 6,
      h: 3,
    }))
    const compacted = compactLayout(messy)
    const visible = compacted.filter((item) => item.visible)

    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        expect(layoutItemsOverlap(visible[i], visible[j])).toBe(false)
      }
    }
  })
})
