import { describe, expect, it } from "vitest"

import {
  migrateStoredDensity,
  normalizeDataTableDensity,
  isDataTableDensity,
} from "./data-table-density"

describe("data-table-density", () => {
  it("accepts sprint 2.1 density values", () => {
    expect(isDataTableDensity("compact")).toBe(true)
    expect(isDataTableDensity("comfortable")).toBe(true)
    expect(isDataTableDensity("spacious")).toBe(true)
    expect(isDataTableDensity("default")).toBe(false)
  })

  it("migrates legacy default to comfortable", () => {
    expect(migrateStoredDensity("compact")).toBe("compact")
    expect(migrateStoredDensity("default")).toBe("comfortable")
    expect(migrateStoredDensity("comfortable")).toBe("comfortable")
    expect(migrateStoredDensity("spacious")).toBe("spacious")
    expect(migrateStoredDensity("nope")).toBe("comfortable")
  })

  it("normalizes prop values", () => {
    expect(normalizeDataTableDensity("comfortable")).toBe("comfortable")
    expect(normalizeDataTableDensity("default")).toBe("comfortable")
    expect(normalizeDataTableDensity("spacious")).toBe("spacious")
    expect(normalizeDataTableDensity(undefined)).toBe("comfortable")
  })
})
