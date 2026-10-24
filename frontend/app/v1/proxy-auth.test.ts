import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "./[[...segments]]/route";

const context = (segments: string[]) => ({ params: Promise.resolve({ segments }) });

describe("same-origin auth proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores real login tokens only in HttpOnly cookies", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "real-access",
          refresh_token: "real-refresh",
          expires_in: 900,
          user: { id: "u1", username: "alice" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await POST(
      new NextRequest("https://app.example/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "alice", password: "password" }),
        headers: { "Content-Type": "application/json" },
      }),
      context(["auth", "login"]),
    );
    const body = await response.json();
    const cookies = response.headers.get("set-cookie") || "";

    expect(body.access_token).toBe("__http_only_cookie__");
    expect(body.refresh_token).toBe("__http_only_cookie__");
    expect(JSON.stringify(body)).not.toContain("real-access");
    expect(JSON.stringify(body)).not.toContain("real-refresh");
    expect(cookies).toContain("mlair_access_token=real-access");
    expect(cookies).toContain("mlair_refresh_token=real-refresh");
    expect(cookies.toLowerCase()).toContain("httponly");
  });

  it("replaces browser authorization with the access cookie", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "u1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    await GET(
      new NextRequest("https://app.example/v1/auth/me", {
        headers: {
          Authorization: "Bearer __http_only_cookie__",
          Cookie: "mlair_access_token=real-access; mlair_refresh_token=real-refresh",
        },
      }),
      context(["auth", "me"]),
    );

    const init = upstreamFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer real-access");
    expect((init.headers as Headers).get("Cookie")).toBeNull();
  });
});
