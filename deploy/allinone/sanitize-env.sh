#!/bin/bash
# Normalize env vars for all-in-one (podman-compose may pass unexpanded ${VAR:-default} literals).
set -euo pipefail

_mlair_env_or_default() {
  local key="$1" default="$2"
  local val="${!key:-}"
  if [[ -z "$val" ]] || [[ "$val" == *'${'* ]]; then
    printf '%s' "$default"
    return
  fi
  if [[ "$val" =~ ^\$\{[^:]+:-([^}]+)\}$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  printf '%s' "$val"
}

export ML_AIR_SCHEDULER_METRICS_PORT="$(_mlair_env_or_default ML_AIR_SCHEDULER_METRICS_PORT 9102)"
export ML_AIR_EXECUTOR_METRICS_PORT="$(_mlair_env_or_default ML_AIR_EXECUTOR_METRICS_PORT 9103)"
export ML_AIR_REALTIME_METRICS_PORT="$(_mlair_env_or_default ML_AIR_REALTIME_METRICS_PORT 9104)"

export ML_AIR_REDIS_URL="$(_mlair_env_or_default ML_AIR_REDIS_URL redis://127.0.0.1:6379/0)"
if [[ "$ML_AIR_REDIS_URL" == *'redis://redis:'* ]]; then
  export ML_AIR_REDIS_URL="redis://127.0.0.1:6379/0"
fi

export ML_AIR_DATABASE_URL="$(_mlair_env_or_default ML_AIR_DATABASE_URL postgresql://mlair:mlair@127.0.0.1:5432/mlair?client_encoding=utf8)"
if [[ "$ML_AIR_DATABASE_URL" == *'@postgres:'* ]]; then
  export ML_AIR_DATABASE_URL="postgresql://mlair:mlair@127.0.0.1:5432/mlair?client_encoding=utf8"
fi

export ML_AIR_API_BASE_URL="$(_mlair_env_or_default ML_AIR_API_BASE_URL http://127.0.0.1:18080)"
if [[ "$ML_AIR_API_BASE_URL" == *'://api:'* ]]; then
  export ML_AIR_API_BASE_URL="http://127.0.0.1:18080"
fi
