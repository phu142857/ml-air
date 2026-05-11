import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recordTrainIntentTelemetry } from "./train-intent-telemetry";

describe("recordTrainIntentTelemetry", () => {
  const origFetch = globalThis.fetch;
  const origUrl = process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL;
  const origDebug = process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL;
    delete process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL;
    else process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL = origUrl;
    if (origDebug === undefined) delete process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG;
    else process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG = origDebug;
  });

  it("no-ops when URL unset", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    recordTrainIntentTelemetry({
      intent: "hub_runs_trigger",
      tenant_id: "t1",
      project_id: "p1",
      dataset_id: "d1",
      model_id: "m1"
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs JSON when URL set", async () => {
    process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL = "https://collector.example/hook";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    recordTrainIntentTelemetry({
      intent: "pipeline_gated_run",
      tenant_id: "t1",
      project_id: "p1",
      pipeline_id: "pipe-1"
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://collector.example/hook");
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(true);
    const body = JSON.parse(String(init?.body));
    expect(body.intent).toBe("pipeline_gated_run");
    expect(body.tenant_id).toBe("t1");
    expect(body.project_id).toBe("p1");
    expect(body.pipeline_id).toBe("pipe-1");
    expect(typeof body.ts).toBe("number");
  });
});
