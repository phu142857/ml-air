/**
 * Optional client-side beacon for “where did training intent originate?” (Hub vs pipeline).
 * No-op unless `NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL` is set; set `NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG=1` to log payloads in the console.
 */

export type TrainIntentSource = "hub_runs_trigger" | "pipeline_gated_run";

export type TrainIntentTelemetryFields = {
  intent: TrainIntentSource;
  tenant_id: string;
  project_id: string;
  dataset_id?: string;
  model_id?: string;
  pipeline_id?: string;
};

export function recordTrainIntentTelemetry(fields: TrainIntentTelemetryFields): void {
  if (typeof window === "undefined") return;
  const url = String(process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL || "").trim();
  const debug = String(process.env.NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG || "").trim() === "1";
  const body = { ...fields, ts: Date.now() };
  if (debug) {
    globalThis.console?.info?.("[mlair train intent telemetry]", body);
  }
  if (!url) return;
  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* ignore */
  }
}
