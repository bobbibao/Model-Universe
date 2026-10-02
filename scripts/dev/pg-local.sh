#!/usr/bin/env bash
# A throwaway local Postgres with pgvector for the `db` test tier when no Docker daemon is available.
#
#   sudo apt-get install -y postgresql-16 postgresql-16-pgvector   # once
#   scripts/dev/pg-local.sh start                                    # prints the DSNs to export
#   scripts/dev/pg-local.sh stop
#
# initdb refuses to run as root, so the cluster runs as the `postgres` OS user (runuser). Local PG16 + pgvector 0.6
# differs from the compose db service's PG18 + pgvector 0.8: do not rely on pgvector features newer than 0.6.
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n1)}"
DATA_DIR="${PG_LOCAL_DIR:-/tmp/shop-agent-pg}"
PORT="${PG_LOCAL_PORT:-55433}"
AGENT_PASSWORD="${PG_LOCAL_PASSWORD:-localtest}"

as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

psql_su() {
  as_postgres "$PGBIN/psql" -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"
}

case "${1:-start}" in
  start)
    if [ ! -d "$DATA_DIR" ]; then
      mkdir -p "$DATA_DIR"
      [ "$(id -u)" -eq 0 ] && chown postgres:postgres "$DATA_DIR"
      as_postgres "$PGBIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
    fi
    if ! as_postgres "$PGBIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      as_postgres "$PGBIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA_DIR/log" \
        -w start >/dev/null
    fi
    psql_su -d postgres -v agent_password="$AGENT_PASSWORD" -v agent_role=shop_agent_test -v agent_db=shop_agent_test \
      -f "$(dirname "$0")/../../infra/sql/shop_agent.sql" >/dev/null
    psql_su -d shop_agent_test -c 'CREATE EXTENSION IF NOT EXISTS vector' >/dev/null
    # The web's `yarn test:db` database (its tests drop and recreate the tables).
    psql_su -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'web_ecommerce_test'" | grep -q 1 \
      || psql_su -d postgres -c 'CREATE DATABASE web_ecommerce_test' >/dev/null
    echo "export AGENT_TEST_DATABASE_URL=postgresql://shop_agent_test:${AGENT_PASSWORD}@127.0.0.1:${PORT}/shop_agent_test"
    echo "export PG_SUPERUSER_URL=postgresql://postgres@127.0.0.1:${PORT}/postgres"
    echo "export TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=${PORT} TEST_DB_USERNAME=postgres TEST_DB_NAME=web_ecommerce_test"
    ;;
  stop)
    as_postgres "$PGBIN/pg_ctl" -D "$DATA_DIR" -m fast stop
    ;;
  *)
    echo "usage: $0 start|stop" >&2
    exit 2
    ;;
esac
