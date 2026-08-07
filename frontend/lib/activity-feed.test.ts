import { describe, expect, it } from "vitest";

import { activityResourceHref, activityVerbLabel } from "@/lib/activity-feed";
import type { ActivityFeedItem } from "@/lib/api";

const baseItem = (overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem => ({
  id: "a1",
  ts: "2026-08-06T08:35:00Z",
  scope_type: "model",
  scope_id: "fraud-detection",
  verb: "promoted",
  actor_kind: "user",
  actor_id: "u1",
  actor_name: "John",
  title: "John promoted model",
  summary: "Version 23 → Production",
  metadata: {},
  ...overrides,
});

describe("activity-feed helpers", () => {
  it("maps model scope to models route", () => {
    expect(activityResourceHref(baseItem())).toBe("/models/fraud-detection");
  });

  it("maps run scope to runs route", () => {
    expect(activityResourceHref(baseItem({ scope_type: "run", scope_id: "r-1" }))).toBe("/runs/r-1");
  });

  it("labels promoted verb", () => {
    expect(activityVerbLabel("promoted")).toBe("promoted");
    expect(activityVerbLabel("version_created")).toBe("created version");
  });
});
