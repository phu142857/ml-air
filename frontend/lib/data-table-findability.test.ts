import { describe, expect, it } from "vitest"

import {
  defaultRowCopyText,
  deriveFilterOptions,
  formatRowsForClipboard,
  isQuickFilterColumn,
  toggleSelectionSet,
} from "./data-table-findability"

describe("data-table-findability", () => {
  it("derives filter options from row values", () => {
    const options = deriveFilterOptions(
      { getFilterValue: (row: { status: string }) => row.status },
      [{ status: "running" }, { status: "failed" }, { status: "running" }],
    )
    expect(options).toEqual([
      { label: "failed", value: "failed" },
      { label: "running", value: "running" },
    ])
  })

  it("prefers explicit filterOptions and skips high cardinality", () => {
    expect(
      deriveFilterOptions(
        {
          filterOptions: [{ label: "On", value: "on" }],
          getFilterValue: () => "ignored",
        },
        [{}, {}],
      ),
    ).toEqual([{ label: "On", value: "on" }])

    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }))
    expect(
      deriveFilterOptions({ getFilterValue: (row: { id: string }) => row.id }, many),
    ).toEqual([])
  })

  it("formats clipboard rows and toggles selection", () => {
    expect(formatRowsForClipboard(["a\tb", "", "c"])).toBe("a\tb\nc")
    expect(
      defaultRowCopyText({ name: "alpha", status: "ok" }, [
        { getSearchValue: (r) => r.name },
        { getFilterValue: (r) => r.status },
      ]),
    ).toBe("alpha\tok")

    const next = toggleSelectionSet(new Set(["a"]), "b", true)
    expect([...next].sort()).toEqual(["a", "b"])
    expect([...toggleSelectionSet(next, "a", false)]).toEqual(["b"])
    expect(isQuickFilterColumn([{ label: "A", value: "a" }])).toBe(true)
    expect(
      isQuickFilterColumn(
        Array.from({ length: 8 }, (_, i) => ({ label: String(i), value: String(i) })),
      ),
    ).toBe(false)
  })
})
