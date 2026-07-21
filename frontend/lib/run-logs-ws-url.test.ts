import { describe, expect, it, vi, afterEach } from "vitest";

import { buildRunLogsWsUrl } from "./api";

describe("buildRunLogsWsUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses same-origin ws when API base is empty", () => {
    vi.stubGlobal("window", {
      location: { host: "localhost:8080", protocol: "http:" },
    } as Window);
    const url = buildRunLogsWsUrl("t1", "p1", "run-1", "tok");
    expect(url).toBe(
      "ws://localhost:8080/v1/tenants/t1/projects/p1/runs/run-1/logs/ws?token=tok",
    );
  });

  it("rewrites explicit http API base to ws", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal("window", undefined as unknown as Window);
    vi.stubGlobal("__ML_AIR_RUNTIME_CONFIG__" as never, undefined);
    const url = buildRunLogsWsUrl("t1", "p1", "run-1", "tok");
    expect(url).toContain("/v1/tenants/t1/projects/p1/runs/run-1/logs/ws");
    expect(url).toContain("token=tok");
  });
});
