import { existsSync } from "node:fs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);

const STRIP_FROM_UPSTREAM = new Set([
  ...HOP_BY_HOP,
  "content-encoding",
  "content-length",
  "transfer-encoding"
]);

function primaryUpstreamBase(): string {
  const raw =
    process.env.MLAIR_NEXT_INTERNAL_API_URL ||
    process.env.ML_AIR_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8080";
  return normBase(String(raw));
}

function normBase(b: string): string {
  return b.trim().replace(/\/$/, "");
}

function formatFetchError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.filter(Boolean).join(" | ") || "unknown";
}

function proxyFetchTimeoutMs(): number {
  const n = Number(process.env.MLAIR_NEXT_PROXY_FETCH_MS || "20000");
  if (!Number.isFinite(n)) return 20_000;
  return Math.min(120_000, Math.max(3000, Math.floor(n)));
}

/**
 * GET/HEAD: try several API bases on connection failure.
 *
 * Inside a Linux container, ``localhost:8080`` is usually **not** the API service; prefer
 * ``http://api:<port>`` and numeric loopback before ``localhost`` (IPv4/IPv6 ambiguity).
 */
function upstreamBasesForGet(): string[] {
  const primary = primaryUpstreamBase();
  let port = "8080";
  try {
    const u = new URL(primary.includes("://") ? primary : `http://${primary}`);
    port = u.port || (u.protocol === "https:" ? "443" : "80");
  } catch {
    return [primary];
  }

  const inDocker = existsSync("/.dockerenv");
  const apiBase = normBase(`http://api:${port}`);
  const loopbacks = inDocker
    ? [
        normBase(`http://host.docker.internal:${port}`),
        normBase(`http://127.0.0.1:${port}`),
        normBase(`http://localhost:${port}`)
      ]
    : [
        normBase(`http://127.0.0.1:${port}`),
        normBase(`http://localhost:${port}`),
        normBase(`http://host.docker.internal:${port}`)
      ];

  const ordered = inDocker ? [apiBase, ...loopbacks, primary] : [primary, apiBase, ...loopbacks];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of ordered) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function pathFromSegments(segments: string[] | undefined): string {
  if (!segments?.length) return "/v1";
  return `/v1/${segments.join("/")}`;
}

function buildUpstreamUrl(req: NextRequest, segments: string[] | undefined, base: string): string {
  const b = base.replace(/\/$/, "");
  const path = pathFromSegments(segments);
  const u = new URL(path, `${b}/`);
  u.search = req.nextUrl.search;
  return u.toString();
}

function forwardRequestHeaders(req: NextRequest): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (lk.startsWith("x-forwarded-")) return;
    if (lk === "host") return;
    if (HOP_BY_HOP.has(lk)) return;
    out.set(key, value);
  });
  return out;
}

function filterResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (STRIP_FROM_UPSTREAM.has(key.toLowerCase())) return;
    out.append(key, value);
  });
  return out;
}

function toUpstreamResponse(upstream: Response): Response {
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterResponseHeaders(upstream.headers)
  });
}

async function proxy(req: NextRequest, segments: string[] | undefined): Promise<Response> {
  const headers = forwardRequestHeaders(req);
  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store"
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    (init as { duplex?: string }).duplex = "half";
  }

  const readOnly = req.method === "GET" || req.method === "HEAD";
  const bases = readOnly ? upstreamBasesForGet() : [normBase(primaryUpstreamBase())];

  const ms = proxyFetchTimeoutMs();
  const signal = Number.isFinite(ms) && ms > 0 ? AbortSignal.timeout(ms) : undefined;

  let lastError: unknown;
  for (const base of bases) {
    const url = buildUpstreamUrl(req, segments, base);
    try {
      const upstream = await fetch(url, { ...init, signal });
      return toUpstreamResponse(upstream);
    } catch (e) {
      lastError = e;
    }
  }

  return NextResponse.json(
    {
      error: "mlair_upstream_unreachable",
      message: formatFetchError(lastError),
      hint:
        "Next.js could not connect to the API. Check `docker compose ps` (api Up), published port, and MLAIR_NEXT_INTERNAL_API_URL. Linux: frontend service needs extra_hosts host.docker.internal:host-gateway if the API only listens on the host.",
      tried: bases
    },
    { status: 502 }
  );
}

type RouteCtx = { params: Promise<{ segments?: string[] }> };

async function handle(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  try {
    const { segments } = await ctx.params;
    return await proxy(req, segments);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "mlair_proxy_error", message: msg }, { status: 500 });
  }
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
