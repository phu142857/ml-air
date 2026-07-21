import { describe, expect, it } from "vitest"

import { formatRuntimeSeconds } from "./usage-format"

describe("formatRuntimeSeconds", () => {
  it("shows two largest units at each scale", () => {
    expect(formatRuntimeSeconds(null)).toBe("—")
    expect(formatRuntimeSeconds(45)).toBe("45s")
    expect(formatRuntimeSeconds(61)).toBe("1m 1s")
    expect(formatRuntimeSeconds(3_661)).toBe("1h 1m")
    expect(formatRuntimeSeconds(90_061)).toBe("1d 1h")
  })
})
