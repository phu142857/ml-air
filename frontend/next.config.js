const path = require("path");
const fs = require("fs");

/**
 * Widen file-tracing to the repo root only in a real monorepo checkout (two lockfiles).
 * In Docker the build context is just `frontend/` → parent has no `package-lock.json`;
 * forcing `outputFileTracingRoot` to `..` there can trace paths outside `/app` that are
 * not copied into `.next/standalone`, and `node server.js` exits at startup.
 */
const monorepoRoot = path.join(__dirname, "..");
const hasRootLockfile = fs.existsSync(path.join(monorepoRoot, "package-lock.json"));
const hasFrontendLockfile = fs.existsSync(path.join(__dirname, "package-lock.json"));
const outputFileTracingRoot =
  hasRootLockfile && hasFrontendLockfile ? monorepoRoot : undefined;

const securityHeaders = [
  { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https: wss: ws:${process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : ""}` },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  ...(outputFileTracingRoot ? { outputFileTracingRoot } : {})
};

module.exports = nextConfig;
