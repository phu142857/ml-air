import { describe, expect, it } from "vitest";

import { resolveHubDefaultRoute, hubDefaultRoutePath } from "./hub-default-route";

describe("hub-default-route", () => {
  it("defaults to datasets", () => {
    expect(resolveHubDefaultRoute(null)).toBe("datasets");
    expect(resolveHubDefaultRoute("")).toBe("datasets");
    expect(resolveHubDefaultRoute("invalid")).toBe("datasets");
  });

  it("accepts lifecycle and dashboard", () => {
    expect(resolveHubDefaultRoute("lifecycle")).toBe("lifecycle");
    expect(hubDefaultRoutePath("lifecycle")).toBe("/lifecycle");
    expect(resolveHubDefaultRoute("dashboard")).toBe("dashboard");
  });
});
