import { describe, expect, it, vi, afterEach } from "vitest";

import { inferRealtimeWsBaseFromLocation, resolveRealtimeWsBase } from "./realtime-url";

describe("realtime-url", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers explicit runtime URL", () => {
    expect(resolveRealtimeWsBase("wss://rt.example.com", "ws://ignored")).toBe("wss://rt.example.com");
  });

  it("falls back to build env then same-origin default", () => {
    expect(resolveRealtimeWsBase("", "ws://build:8001")).toBe("ws://build:8001");
    vi.stubGlobal("window", undefined as unknown as Window);
    expect(resolveRealtimeWsBase(null, null)).toBe("ws://localhost:8080");
  });

  it("infers same-origin for local dev", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", host: "localhost:8080", protocol: "http:" },
    } as Window);
    expect(inferRealtimeWsBaseFromLocation()).toBe("ws://localhost:8080");
  });

  it("infers same host for reverse-proxy deploys", () => {
    vi.stubGlobal("window", {
      location: { hostname: "mlair.dev", host: "mlair.dev", protocol: "https:" },
    } as Window);
    expect(inferRealtimeWsBaseFromLocation()).toBe("wss://mlair.dev");
  });
});
