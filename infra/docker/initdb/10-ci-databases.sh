#!/bin/sh
# First start of the compose database only (docker-entrypoint-initdb.d): the web shop's database, the read-only
# ci_reader role on it, and the agent's own database. Passwords come from the container environment (infra/.env).
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $WEB_DB_NAME"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$WEB_DB_NAME" -v web_role="$POSTGRES_USER" \
     -v ci_reader_password="$CI_READER_PASSWORD" -f /sql/ci_reader.sql
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v agent_password="$CI_AGENT_PASSWORD" -f /sql/ci_agent.sql
