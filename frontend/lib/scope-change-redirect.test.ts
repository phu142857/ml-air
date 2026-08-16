import { describe, expect, it } from "vitest"

import { resolveLineageScopeReset, resolveScopeChangeRedirect } from "./scope-change-redirect"

describe("resolveScopeChangeRedirect", () => {
  it("maps run detail to runs list", () => {
    expect(resolveScopeChangeRedirect("/runs/run_abc")).toEqual({ href: "/runs", label: "Runs" })
  })

  it("maps pipeline subroutes to pipelines list", () => {
    expect(resolveScopeChangeRedirect("/pipelines/p1/versions")).toEqual({
      href: "/pipelines",
      label: "Pipelines",
    })
  })

  it("skips identity and settings", () => {
    expect(resolveScopeChangeRedirect("/identity/users/u1")).toBeNull()
    expect(resolveScopeChangeRedirect("/settings/profile")).toBeNull()
  })

  it("skips list pages", () => {
    expect(resolveScopeChangeRedirect("/runs")).toBeNull()
    expect(resolveScopeChangeRedirect("/dashboard")).toBeNull()
  })
})

describe("resolveLineageScopeReset", () => {
  it("clears lineage query when graph is loaded", () => {
    expect(resolveLineageScopeReset("/lineage", "?run=run_1")).toEqual({
      href: "/lineage",
      label: "Lineage",
    })
  })

  it("no-op when lineage is empty", () => {
    expect(resolveLineageScopeReset("/lineage", "")).toBeNull()
  })
})
