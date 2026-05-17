import { describe, expect, it, vi, afterEach } from "vitest";

import { inferRealtimeWsBaseFromLocation, resolveRealtimeWsBase } from "./realtime-url";

describe("realtime-url", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers explicit runtime URL", () => {
    expect(resolveRealtimeWsBase("wss://rt.example.com", "ws://ignored")).toBe("wss://rt.example.com");
  });

  it("falls back to build env then default", () => {
    expect(resolveRealtimeWsBase("", "ws://build:8001")).toBe("ws://build:8001");
    expect(resolveRealtimeWsBase(null, null)).toBe("ws://localhost:8001");
  });

  it("infers localhost for local dev", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", protocol: "http:" },
    } as Window);
    expect(inferRealtimeWsBaseFromLocation()).toBe("ws://localhost:8001");
  });

  it("infers port 8001 on same host for quickstart", () => {
    vi.stubGlobal("window", {
      location: { hostname: "mlair.dev", protocol: "https:" },
    } as Window);
    expect(inferRealtimeWsBaseFromLocation()).toBe("wss://mlair.dev:8001");
  });
});
