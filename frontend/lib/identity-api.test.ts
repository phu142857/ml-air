import { beforeEach, describe, expect, it } from "vitest";

import { clearAuthSession, loadAuthSession, saveAuthSession } from "./identity-api";

describe("identity session storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("never persists access or refresh token values", () => {
    saveAuthSession({
      accessToken: "secret-access-token",
      refreshToken: "secret-refresh-token",
      username: "alice",
    });

    const raw = localStorage.getItem("ml-air:auth-session") || "";
    expect(raw).not.toContain("secret-access-token");
    expect(raw).not.toContain("secret-refresh-token");
    expect(loadAuthSession()).toEqual({
      accessToken: "__http_only_cookie__",
      refreshToken: "__http_only_cookie__",
      username: "alice",
    });
  });

  it("removes legacy sessions that contain browser-readable tokens", () => {
    localStorage.setItem(
      "ml-air:ui-context",
      JSON.stringify({ tenantId: "t1", projectId: "p1", token: "legacy-access" }),
    );
    localStorage.setItem(
      "ml-air:auth-session",
      JSON.stringify({ accessToken: "legacy-access", refreshToken: "legacy-refresh" }),
    );
    expect(loadAuthSession()).toBeNull();
    expect(localStorage.getItem("ml-air:auth-session")).toBeNull();
    expect(localStorage.getItem("ml-air:ui-context")).not.toContain("legacy-access");
    clearAuthSession();
  });
});
