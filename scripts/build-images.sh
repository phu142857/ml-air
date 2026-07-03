#!/usr/bin/env bash
# Build the all-in-one MLAir image (equivalent to `mlair build`).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENGINE="${CONTAINER_ENGINE:-docker}"
IMAGE="${MLAIR_IMAGE:-ml-air:latest}"

echo "==> ${ENGINE} build all-in-one: ${IMAGE}"
"${ENGINE}" build -f deploy/Dockerfile.allinone -t "${IMAGE}" .

echo "Done. Start with: mlair start"
