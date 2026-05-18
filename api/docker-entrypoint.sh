#!/bin/sh
set -e

# Named volumes are often created root-owned; API runs as appuser.
for dir in /mlair/artifacts/datasets /mlair/artifacts/models; do
  mkdir -p "$dir"
  chown -R appuser:appuser "$dir"
done

cd /app
exec runuser -u appuser -- "$@"
