import { describe, expect, it } from "vitest"

import { normalizeTaskId, taskIdPathSegment } from "./api"

describe("normalizeTaskId", () => {
  it("decodes double-encoded colon suffix", () => {
    const id = "c81d112b-eeff-4330-804f-058fe789a58c:eval"
    expect(normalizeTaskId(`${id.replace(":", "%3A")}`)).toBe(id)
    expect(normalizeTaskId(`${id.replace(":", "%253A")}`)).toBe(id)
  })

  it("encodes once for API path", () => {
    const id = "run-1:train"
    expect(taskIdPathSegment(id)).toBe("run-1%3Atrain")
    expect(taskIdPathSegment(`${id.replace(":", "%3A")}`)).toBe("run-1%3Atrain")
  })
})
