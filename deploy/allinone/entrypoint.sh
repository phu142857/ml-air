#!/bin/bash
set -euo pipefail

export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
export PGCLIENTENCODING="${PGCLIENTENCODING:-UTF8}"
export ML_AIR_DATABASE_URL="${ML_AIR_DATABASE_URL:-postgresql://mlair:mlair@127.0.0.1:5432/mlair?client_encoding=utf8}"
export ML_AIR_REDIS_URL="${ML_AIR_REDIS_URL:-redis://127.0.0.1:6379/0}"
export ML_AIR_OTEL_ENABLED="${ML_AIR_OTEL_ENABLED:-1}"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-jaeger:4317}"
export OTEL_EXPORTER_OTLP_INSECURE="${OTEL_EXPORTER_OTLP_INSECURE:-true}"

mkdir -p /var/log/supervisor /mlair/artifacts/datasets /mlair/artifacts/models
chown -R appuser:appuser /mlair/artifacts

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  echo "[mlair] initializing PostgreSQL data directory"
  install -d -o postgres -g postgres -m 0700 "${PGDATA}"
  su - postgres -c "/usr/lib/postgresql/15/bin/initdb -D ${PGDATA} --encoding=UTF8 --locale=C.UTF-8"
  su - postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D ${PGDATA} -o \"-c listen_addresses='127.0.0.1'\" -w start"
  su - postgres -c "psql -v ON_ERROR_STOP=1 --dbname=postgres -c \"DO \\$\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mlair') THEN CREATE ROLE mlair LOGIN PASSWORD 'mlair'; END IF; END \\$\\$;\""
  su - postgres -c "psql -v ON_ERROR_STOP=1 --dbname=postgres -c \"SELECT 1 FROM pg_database WHERE datname = 'mlair'\" | grep -q 1 || createdb -O mlair mlair"
  su - postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D ${PGDATA} -m fast -w stop"
fi

chown -R postgres:postgres "${PGDATA}"

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/mlair.conf
