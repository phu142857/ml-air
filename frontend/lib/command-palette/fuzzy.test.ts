import { describe, expect, it } from "vitest"

import { fuzzyFilter, fuzzyScore } from "./fuzzy"

describe("fuzzyScore", () => {
  it("prefers prefix matches", () => {
    expect(fuzzyScore("dash", "dashboard")).toBeGreaterThan(fuzzyScore("dash", "my-dashboard") ?? 0)
  })

  it("matches subsequence characters", () => {
    expect(fuzzyScore("dsb", "datasets hub")).not.toBeNull()
  })

  it("returns null when characters are missing", () => {
    expect(fuzzyScore("xyz", "dashboard")).toBeNull()
  })
})

describe("fuzzyFilter", () => {
  const items = [
    { id: "a", label: "Dashboard" },
    { id: "b", label: "Datasets" },
    { id: "c", label: "Runs" },
  ]

  it("returns all items for empty query", () => {
    expect(fuzzyFilter("", items, (item) => item.label)).toHaveLength(3)
  })

  it("filters and ranks by relevance", () => {
    const result = fuzzyFilter("da", items, (item) => item.label)
    expect(result.map((row) => row.id).sort()).toEqual(["a", "b"])
  })
})
