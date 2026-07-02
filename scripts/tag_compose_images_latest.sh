#!/usr/bin/env bash
# Retag legacy multi-container images (deploy-*:latest) → ml-air-*:latest for --profile microservices.
set -euo pipefail

ENGINE="${CONTAINER_ENGINE:-docker}"

tag_if_exists() {
  local src="$1"
  local dst="$2"
  if "${ENGINE}" image inspect "${src}" &>/dev/null; then
    echo "==> ${src} -> ${dst}"
    "${ENGINE}" tag "${src}" "${dst}"
    return 0
  fi
  echo "skip (missing): ${src}"
  return 1
}

any=0
tag_if_exists deploy-api:latest ml-air-api:latest && any=1 || true
tag_if_exists deploy-scheduler:latest ml-air-scheduler:latest && any=1 || true
tag_if_exists deploy-executor:latest ml-air-executor:latest && any=1 || true
tag_if_exists deploy-realtime:latest ml-air-realtime:latest && any=1 || true
tag_if_exists deploy-frontend:latest ml-air-frontend:latest && any=1 || true

if [[ "${any}" -eq 0 ]]; then
  echo "No deploy-* images found." >&2
  exit 1
fi

echo "Done. Use: mlair serve --profile microservices"
