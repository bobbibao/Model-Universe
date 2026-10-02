-- The shop agent's own database and role.
--
-- It holds the knowledge base (pgvector tables `kb_*`, created by `shop-agent ingest`) and, with the production
-- runtime, the LangGraph checkpoints and store. The role gets no privilege on the web shop's database: the agent reads
-- the shop as ci_reader (ci_reader.sql) and writes to it only through the web Agent API (docs/adr/0002).
--
-- Run once, as a role that may create roles and databases (e.g. the postgres superuser), from any database:
--
--   psql -d postgres -v agent_password=<a new secret; also goes into the agent's DATABASE_URL> -f infra/sql/shop_agent.sql
--
-- The role is NOSUPERUSER, so it cannot create extensions: create `vector` in the new database as a superuser right
-- after this script (infra/docker/initdb/10-databases.sh and scripts/dev/pg-local.sh do):
--
--   psql -d shop_agent -c 'CREATE EXTENSION IF NOT EXISTS vector'
--
-- Then, in apps/agent-service/.env:  DATABASE_URL=postgresql://shop_agent:<that secret>@localhost:5432/shop_agent
--
-- Optional: -v agent_role=<name> -v agent_db=<name> (default shop_agent / shop_agent), e.g. for a throwaway test
-- database (AGENT_TEST_DATABASE_URL). Re-running the script is safe; the password is set each time.

\set ON_ERROR_STOP on
\if :{?agent_role}
\else
  \set agent_role shop_agent
\endif
\if :{?agent_db}
\else
  \set agent_db shop_agent
\endif

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'agent_role', :'agent_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'agent_role') \gexec
ALTER ROLE :"agent_role" LOGIN PASSWORD :'agent_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

SELECT format('CREATE DATABASE %I OWNER %I', :'agent_db', :'agent_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'agent_db') \gexec

-- Only the owner (and superusers) may connect.
REVOKE ALL ON DATABASE :"agent_db" FROM PUBLIC;
