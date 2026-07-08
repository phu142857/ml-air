import { describe, expect, it } from "vitest";

import { formatVersionLabel } from "./version-label";

describe("formatVersionLabel", () => {
  it("keeps dataset vN labels as-is", () => {
    expect(formatVersionLabel("v1")).toBe("v1");
    expect(formatVersionLabel("v12")).toBe("v12");
  });

  it("normalizes numeric and V-prefixed labels", () => {
    expect(formatVersionLabel(1)).toBe("v1");
    expect(formatVersionLabel("3")).toBe("v3");
    expect(formatVersionLabel("V2")).toBe("v2");
  });

  it("does not double-prefix", () => {
    expect(formatVersionLabel("v1")).not.toBe("vv1");
  });

  it("returns fallback for empty values", () => {
    expect(formatVersionLabel(null)).toBe("—");
    expect(formatVersionLabel(undefined, "?")).toBe("?");
  });
});
