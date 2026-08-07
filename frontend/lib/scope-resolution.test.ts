import { describe, expect, it } from "vitest";
import {
  resolveScopePairsFromCache,
  resolveTenantIdsFromCache,
  setAccessibleScopeCache,
} from "./scope-resolution";

describe("scope-resolution", () => {
  const scopes = [
    { tenant_id: "acme", project_id: "proj_a" },
    { tenant_id: "acme", project_id: "proj_b" },
    { tenant_id: "beta", project_id: "proj_x" },
  ];

  it("resolves all pairs for aggregate scope", () => {
    setAccessibleScopeCache(scopes);
    expect(resolveScopePairsFromCache("all", "all")).toEqual(scopes);
  });

  it("resolves tenant-level aggregate", () => {
    setAccessibleScopeCache(scopes);
    expect(resolveScopePairsFromCache("acme", "all")).toEqual([
      { tenant_id: "acme", project_id: "proj_a" },
      { tenant_id: "acme", project_id: "proj_b" },
    ]);
  });

  it("resolves pinned scope", () => {
    setAccessibleScopeCache(scopes);
    expect(resolveScopePairsFromCache("beta", "proj_x")).toEqual([
      { tenant_id: "beta", project_id: "proj_x" },
    ]);
  });

  it("lists tenant ids from cache only", () => {
    setAccessibleScopeCache(scopes);
    expect(resolveTenantIdsFromCache("all")).toEqual(["acme", "beta"]);
  });
});
