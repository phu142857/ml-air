import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMlairRealtime } from "./use-mlair-realtime";

vi.mock("./app-context", () => ({
  useAppContext: () => ({
    tenantId: "t1",
    projectId: "p1",
    token: "tok-1"
  })
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.({ code: 1000 } as CloseEvent);
  }

  emitJson(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

function HookHarness() {
  useMlairRealtime();
  return null;
}

function renderWithQueryClient(queryClient: QueryClient): { unmount: () => void } {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HookHarness />
    </QueryClientProvider>
  );
  return { unmount: view.unmount };
}

describe("useMlairRealtime", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_MLAIR_REALTIME_WS", "ws://localhost:8001/ws");
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    globalThis.WebSocket = originalWebSocket;
  });

  it("deduplicates by event_id before invalidation", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { unmount } = renderWithQueryClient(queryClient);
    const ws = FakeWebSocket.instances[0];

    const evt = {
      version: "v1",
      event_id: "evt-1",
      type: "run.updated",
      resource_id: "run-1",
      payload: { status: "RUNNING", updated_at: 1710000000 }
    };
    ws.emitJson(evt);
    ws.emitJson(evt);
    vi.advanceTimersByTime(400);

    expect(invalidateSpy).toHaveBeenCalled();
    const runKeyCalls = invalidateSpy.mock.calls.filter(
      (args) => JSON.stringify(args[0]?.queryKey) === JSON.stringify(["run", "run-1"])
    );
    expect(runKeyCalls).toHaveLength(1);
    unmount();
  });

  it("ignores stale run.updated payload by updated_at", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["run", "run-1"], {
      run_id: "run-1",
      tenant_id: "t1",
      project_id: "p1",
      pipeline_id: "pipe-1",
      status: "SUCCESS",
      updated_at: "2025-01-01T00:00:10.000Z"
    });

    const { unmount } = renderWithQueryClient(queryClient);
    const ws = FakeWebSocket.instances[0];

    ws.emitJson({
      version: "v1",
      event_id: "evt-2",
      type: "run.updated",
      resource_id: "run-1",
      payload: { status: "RUNNING", updated_at: 1 } // stale
    });

    const run = queryClient.getQueryData<{ status: string; updated_at: string }>(["run", "run-1"]);
    expect(run?.status).toBe("SUCCESS");
    expect(run?.updated_at).toBe("2025-01-01T00:00:10.000Z");
    unmount();
  });

  it("invalidates model keys for model.promoted", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { unmount } = renderWithQueryClient(queryClient);
    const ws = FakeWebSocket.instances[0];

    ws.emitJson({
      version: "v1",
      event_id: "evt-3",
      type: "model.promoted",
      resource_id: "m1",
      payload: { model_id: "m1", updated_at: 1710000001, version: 2, stage: "production" }
    });
    vi.advanceTimersByTime(400);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["models", "t1", "p1"], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["model-versions", "t1", "p1", "m1"],
      exact: false
    });
    unmount();
  });
});
