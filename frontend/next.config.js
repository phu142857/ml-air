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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  ...(outputFileTracingRoot ? { outputFileTracingRoot } : {})
};

module.exports = nextConfig;
