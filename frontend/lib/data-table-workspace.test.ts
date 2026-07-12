import { describe, expect, it } from "vitest"

import {
  duplicateViewName,
  mergeColumnOrder,
  migrateWorkspaceState,
  moveColumnOrder,
  normalizeSavedView,
  uniqueViewName,
} from "./data-table-workspace"

describe("data-table-workspace", () => {
  it("merges column order with new columns appended", () => {
    expect(mergeColumnOrder(["b", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"])
    expect(mergeColumnOrder(["x"], ["a", "b"])).toEqual(["a", "b"])
  })

  it("moves columns within order", () => {
    expect(moveColumnOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"])
    expect(moveColumnOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"])
    expect(moveColumnOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"])
  })

  it("migrates legacy stored state into v2 workspace", () => {
    const migrated = migrateWorkspaceState(
      {
        views: [{ id: "1", name: "Ops", density: "default", pageSize: 50, visibility: { a: false } }],
        activeViewId: "1",
      },
      {
        visibility: { a: true, b: true },
        columnOrder: ["a", "b"],
        pinned: [],
        columnWidths: {},
      },
    )
    expect(migrated.version).toBe(2)
    expect(migrated.activeViewId).toBe("1")
    expect(migrated.views[0]?.density).toBe("comfortable")
    expect(migrated.views[0]?.columnOrder).toEqual(["a", "b"])
    expect(migrated.layout.columnOrder).toEqual(["a", "b"])
  })

  it("reads nested v2 layout for visibility, order, and pin", () => {
    const migrated = migrateWorkspaceState(
      {
        version: 2,
        views: [],
        activeViewId: null,
        layout: {
          visibility: { a: false, b: true },
          columnOrder: ["b", "a"],
          pinned: ["b"],
          columnWidths: { a: 120 },
        },
      },
      {
        visibility: { a: true, b: true },
        columnOrder: ["a", "b"],
        pinned: [],
        columnWidths: {},
      },
    )
    expect(migrated.layout.visibility).toEqual({ a: false, b: true })
    expect(migrated.layout.columnOrder).toEqual(["b", "a"])
    expect(migrated.layout.pinned).toEqual(["b"])
    expect(migrated.layout.columnWidths).toEqual({ a: 120 })
  })

  it("normalizes saved views and generates unique names", () => {
    const view = normalizeSavedView(
      { id: "v1", name: "  Main ", density: "spacious", columnOrder: ["b"] },
      ["a", "b"],
    )
    expect(view.name).toBe("Main")
    expect(view.columnOrder).toEqual(["b", "a"])
    expect(uniqueViewName("Main", ["Main", "Main (2)"])).toBe("Main (3)")
    expect(duplicateViewName("Main", ["Main"])).toBe("Main (copy)")
    expect(duplicateViewName("Main", ["Main", "Main (copy)"])).toBe("Main (copy) (2)")
  })
})
