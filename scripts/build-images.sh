#!/usr/bin/env bash
# Build all ML-Air images from the monorepo root (Podman/Docker compatible).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENGINE="${CONTAINER_ENGINE:-docker}"
BASE_IMAGE="${ML_AIR_PYTHON_BASE_IMAGE:-ml-air-python-base:local}"
BUILD_BASE="${ML_AIR_BUILD_PYTHON_BASE:-1}"

if [[ "${BUILD_BASE}" == "1" ]]; then
  echo "==> ${ENGINE} build python base: ${BASE_IMAGE}"
  "${ENGINE}" build -t "${BASE_IMAGE}" -f docker/python-base.Dockerfile .
fi

build_python() {
  local name="$1"
  local dockerfile="$2"
  echo "==> ${ENGINE} build ${name}"
  "${ENGINE}" build \
    --build-arg "PYTHON_BASE_IMAGE=${BASE_IMAGE}" \
    -f "${dockerfile}" \
    -t "ml-air-${name}:local" \
    .
}

build_python api api/Dockerfile
build_python scheduler scheduler/Dockerfile
build_python executor executor/Dockerfile
build_python realtime realtime/Dockerfile

echo "==> ${ENGINE} build frontend"
"${ENGINE}" build -f frontend/Dockerfile -t ml-air-frontend:local .

echo "Done. Images: ml-air-api:local ml-air-scheduler:local ml-air-executor:local ml-air-realtime:local ml-air-frontend:local"
