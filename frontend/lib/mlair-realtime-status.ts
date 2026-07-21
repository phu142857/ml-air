export type MlairRealtimeUiStatus =
  | { kind: "inactive" }
  | { kind: "polling" }
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "reconnecting" }
  | { kind: "fatal"; code: number };

let state: MlairRealtimeUiStatus = { kind: "polling" };
const listeners = new Set<() => void>();

export function getMlairRealtimeUiStatus(): MlairRealtimeUiStatus {
  return state;
}

export function setMlairRealtimeUiStatus(next: MlairRealtimeUiStatus): void {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeMlairRealtimeUiStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
