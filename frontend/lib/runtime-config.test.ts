import { describe, expect, it, vi, afterEach } from "vitest";

import { isInternalServiceHostname, shouldApplyRuntimeApiBaseUrl } from "./runtime-config";

describe("runtime-config api base", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects docker internal hostnames", () => {
    expect(isInternalServiceHostname("mlair_api")).toBe(true);
    expect(isInternalServiceHostname("api")).toBe(true);
    expect(isInternalServiceHostname("localhost")).toBe(false);
    expect(isInternalServiceHostname("alb.example.com")).toBe(false);
  });

  it("does not apply internal api_base_url in browser", () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:8080", hostname: "localhost", port: "8080", protocol: "http:" },
    } as Window);
    expect(shouldApplyRuntimeApiBaseUrl("http://mlair_api")).toBe(false);
    expect(shouldApplyRuntimeApiBaseUrl("http://localhost")).toBe(false);
    expect(shouldApplyRuntimeApiBaseUrl("http://localhost:8080")).toBe(false);
    expect(shouldApplyRuntimeApiBaseUrl("https://api.example.com")).toBe(true);
  });
});
