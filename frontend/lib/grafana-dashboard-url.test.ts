import { describe, expect, it } from "vitest";

import { grafanaDashboardUrl } from "./grafana-dashboard-url";

describe("grafanaDashboardUrl", () => {
  it("returns null without base", () => {
    expect(grafanaDashboardUrl(null, "mlair-lifecycle-semantic.json")).toBeNull();
    expect(grafanaDashboardUrl("", "mlair-lifecycle-semantic.json")).toBeNull();
  });

  it("builds provisioned dashboard path", () => {
    expect(grafanaDashboardUrl("http://localhost:33000", "mlair-lifecycle-semantic.json")).toBe(
      "http://localhost:33000/d/mlair-lifecycle-semantic/mlair-lifecycle-semantic",
    );
  });
});
