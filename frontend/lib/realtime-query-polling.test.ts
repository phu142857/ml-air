import { describe, expect, it, vi, afterEach } from "vitest";

import type { MlairRealtimeUiStatus } from "./mlair-realtime-status";
import {
  POLL_ACTIVE_EXECUTION_MS,
  POLL_FALLBACK_MS,
  POLL_RECONCILE_MS,
  isRealtimeWsPrimary,
  realtimeQueryPollingOptions,
  resolveActiveExecutionRefetchInterval,
  resolveRefetchInterval,
} from "./realtime-query-polling";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getRealtimeWsBase: vi.fn(() => ""),
  };
});

import { getRealtimeWsBase } from "./api";

const mockedGetRealtimeWsBase = vi.mocked(getRealtimeWsBase);

describe("realtimeQueryPollingOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockedGetRealtimeWsBase.mockReturnValue("");
  });

  it("uses reconcile polling when WebSocket is connected", () => {
    mockedGetRealtimeWsBase.mockReturnValue("ws://localhost:8080/ws");
    const opts = realtimeQueryPollingOptions({ kind: "connected" });
    expect(opts.refetchInterval).toBe(POLL_RECONCILE_MS);
    expect(opts.refetchOnWindowFocus).toBe(false);
  });

  it("uses fallback polling while reconnecting", () => {
    mockedGetRealtimeWsBase.mockReturnValue("ws://localhost:8080/ws");
    const opts = realtimeQueryPollingOptions({ kind: "reconnecting" });
    expect(opts.refetchInterval).toBe(POLL_FALLBACK_MS);
    expect(opts.refetchOnWindowFocus).toBe(true);
  });

  it("uses fallback polling when WS is not configured", () => {
    mockedGetRealtimeWsBase.mockReturnValue("");
    const opts = realtimeQueryPollingOptions({ kind: "connected" });
    expect(opts.refetchInterval).toBe(POLL_FALLBACK_MS);
  });
});

describe("resolveRefetchInterval", () => {
  const live = realtimeQueryPollingOptions({ kind: "connected" });
  const fallback = realtimeQueryPollingOptions({ kind: "polling" });

  it("keeps active hot-path polling even when WebSocket is connected", () => {
    expect(resolveRefetchInterval(live, { active: true, activeMs: 1000 })).toBe(1000);
  });

  it("uses reconcile interval for idle queries while connected", () => {
    mockedGetRealtimeWsBase.mockReturnValue("ws://localhost:8080/ws");
    const connected = realtimeQueryPollingOptions({ kind: "connected" });
    expect(resolveRefetchInterval(connected)).toBe(POLL_RECONCILE_MS);
  });

  it("uses active interval for running executions", () => {
    mockedGetRealtimeWsBase.mockReturnValue("ws://localhost:8080/ws");
    const connected = realtimeQueryPollingOptions({ kind: "connected" });
    expect(resolveActiveExecutionRefetchInterval(connected, "RUNNING")).toBe(POLL_ACTIVE_EXECUTION_MS);
    expect(resolveActiveExecutionRefetchInterval(fallback, "RUNNING", 4000)).toBe(4000);
    expect(resolveActiveExecutionRefetchInterval(fallback, "SUCCESS", 4000)).toBe(POLL_FALLBACK_MS);
  });
});

describe("isRealtimeWsPrimary", () => {
  afterEach(() => {
    mockedGetRealtimeWsBase.mockReturnValue("");
  });

  it("is true only for connected + configured WS", () => {
    mockedGetRealtimeWsBase.mockReturnValue("ws://localhost:8080/ws");
    expect(isRealtimeWsPrimary({ kind: "connected" } satisfies MlairRealtimeUiStatus)).toBe(true);
    expect(isRealtimeWsPrimary({ kind: "polling" } satisfies MlairRealtimeUiStatus)).toBe(false);
  });
});
