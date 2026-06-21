import { describe, expect, it } from "vitest";

import { scopeRoleCanSeeExecutionNav } from "./hub-nav-access";

const pinnedTenant = "default";
const pinnedProject = "default_project";

describe("hub-nav-access", () => {
  it("hides Execution for viewer token", () => {
    expect(
      scopeRoleCanSeeExecutionNav(pinnedTenant, pinnedProject, [], "viewer-token"),
    ).toBe(false);
  });

  it("hides Execution when token is empty", () => {
    expect(scopeRoleCanSeeExecutionNav(pinnedTenant, pinnedProject, [], "")).toBe(false);
    expect(scopeRoleCanSeeExecutionNav(pinnedTenant, pinnedProject, [], "   ")).toBe(false);
  });

  it("hides Execution when role cannot be resolved", () => {
    expect(
      scopeRoleCanSeeExecutionNav(pinnedTenant, pinnedProject, [], "some-opaque-token"),
    ).toBe(false);
  });

  it("shows Execution for maintainer and admin tokens", () => {
    expect(
      scopeRoleCanSeeExecutionNav(pinnedTenant, pinnedProject, [], "maintainer-token"),
    ).toBe(true);
    expect(
      scopeRoleCanSeeExecutionNav(pinnedTenant, pinnedProject, [], "admin-token"),
    ).toBe(true);
  });

  it("prefers accessibleScopes role over token substring", () => {
    expect(
      scopeRoleCanSeeExecutionNav(
        pinnedTenant,
        pinnedProject,
        [{ tenant_id: pinnedTenant, project_id: pinnedProject, role: "viewer" }],
        "maintainer-token",
      ),
    ).toBe(false);
  });

  it("hides Execution when scope is not pinned", () => {
    expect(scopeRoleCanSeeExecutionNav("all", pinnedProject, [], "maintainer-token")).toBe(
      false,
    );
  });
});
