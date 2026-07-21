import { describe, expect, it } from "vitest"

import {
  computeVirtualWindow,
  estimateRowHeight,
  shouldVirtualizeRows,
  DATA_TABLE_VIRTUAL_THRESHOLD,
} from "./data-table-performance"

describe("data-table-performance", () => {
  it("estimates denser rows as shorter", () => {
    expect(estimateRowHeight("compact")).toBeLessThan(estimateRowHeight("comfortable"))
    expect(estimateRowHeight("comfortable")).toBeLessThan(estimateRowHeight("spacious"))
  })

  it("auto-virtualizes only past the threshold", () => {
    expect(shouldVirtualizeRows(DATA_TABLE_VIRTUAL_THRESHOLD - 1, "auto")).toBe(false)
    expect(shouldVirtualizeRows(DATA_TABLE_VIRTUAL_THRESHOLD, "auto")).toBe(true)
    expect(shouldVirtualizeRows(10, true)).toBe(true)
    expect(shouldVirtualizeRows(200, false)).toBe(false)
  })

  it("computes spacer offsets for a scrolled window", () => {
    const window = computeVirtualWindow({
      rowCount: 100,
      rowHeight: 40,
      scrollTop: 800,
      viewportHeight: 400,
      overscan: 2,
    })
    expect(window.startIndex).toBe(18) // 800/40 - 2
    expect(window.endIndex).toBeGreaterThan(window.startIndex)
    expect(window.offsetTop).toBe(18 * 40)
    expect(window.offsetBottom).toBe((100 - window.endIndex) * 40)
  })

  it("handles empty lists", () => {
    expect(
      computeVirtualWindow({
        rowCount: 0,
        rowHeight: 40,
        scrollTop: 0,
        viewportHeight: 300,
      }),
    ).toEqual({ startIndex: 0, endIndex: 0, offsetTop: 0, offsetBottom: 0 })
  })
})
