#!/bin/sh
set -e

# Zero-config run environment: compose can omit ML_AIR_DOCKER_IMAGE when MLAIR_IMAGE_REF is baked in.
if [ -z "${ML_AIR_DOCKER_IMAGE:-}" ] && [ -n "${MLAIR_IMAGE_REF:-}" ]; then
  export ML_AIR_DOCKER_IMAGE="${MLAIR_IMAGE_REF}"
fi

# Named volumes are often created root-owned; API runs as appuser.
for dir in /mlair/artifacts/datasets /mlair/artifacts/models; do
  mkdir -p "$dir"
  chown -R appuser:appuser "$dir"
done

cd /app
exec runuser -u appuser -- "$@"
