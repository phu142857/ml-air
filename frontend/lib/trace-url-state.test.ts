import { describe, expect, it } from "vitest";

import {
  buildTraceShareUrl,
  buildTraceViewerSearchParams,
  formatZoomParam,
  parseTraceViewerUrl,
  parseZoomParam,
} from "./trace-url-state";

describe("trace-url-state", () => {
  it("parses and serializes full viewer URL state", () => {
    const sp = new URLSearchParams("trace=abc123&span=span-1&zoom=10-500&q=error");
    expect(parseTraceViewerUrl(sp)).toEqual({
      traceId: "abc123",
      spanId: "span-1",
      zoom: [10, 500],
      q: "error",
    });

    const rebuilt = buildTraceViewerSearchParams({
      traceId: "abc123",
      spanId: "span-1",
      zoom: [10, 500],
      q: "error",
    });
    expect(rebuilt.toString()).toBe("trace=abc123&span=span-1&q=error&zoom=10-500");
  });

  it("rejects invalid zoom params", () => {
    expect(parseZoomParam("bad")).toBeNull();
    expect(parseZoomParam("500-10")).toBeNull();
    expect(formatZoomParam([0, 1200])).toBe("0-1200");
  });

  it("builds share URLs at /traces with optional fields", () => {
    const url = buildTraceShareUrl("trace-1", {
      origin: "https://app.example",
      spanId: "s-1",
      zoom: [5, 95],
      q: "timeout",
    });
    expect(url).toBe("https://app.example/traces?trace=trace-1&span=s-1&q=timeout&zoom=5-95");
  });
});
