-- The CI agent's own database and role (docs/ROADMAP.md T-02).
--
-- The agent keeps its state there (improvements, cases, audit and notification logs, LLM spend) in schema `ci`, and
-- creates its tables itself at startup (apps/agent-service/.../persistence/postgres/schema.sql). The role gets no
-- privilege on any table or view of the web shop's database (like every role it may open a connection there, and
-- see nothing): the agent reads the shop as ci_reader (ci_reader.sql) and writes to it only through the web Agent
-- API (docs/adr/0002).
--
-- Run once, as a role that may create roles and databases (e.g. the postgres superuser), from any database:
--
--   psql -d postgres -v agent_password=<a new secret; also goes into the agent's DATABASE_URL> -f infra/sql/ci_agent.sql
--
-- Then, in apps/agent-service/.env:  DATABASE_URL=postgresql://ci_agent:<that secret>@localhost:5432/ci_agent
--
-- Optional: -v agent_role=<name> -v agent_db=<name> (default ci_agent / ci_agent), e.g. for a throwaway test database
-- (AGENT_TEST_DATABASE_URL, tests/contract). Re-running the script is safe; the password is set each time.

\set ON_ERROR_STOP on
\if :{?agent_role}
\else
  \set agent_role ci_agent
\endif
\if :{?agent_db}
\else
  \set agent_db ci_agent
\endif

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'agent_role', :'agent_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'agent_role') \gexec
ALTER ROLE :"agent_role" LOGIN PASSWORD :'agent_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

SELECT format('CREATE DATABASE %I OWNER %I', :'agent_db', :'agent_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'agent_db') \gexec

-- Only the owner (and superusers) may connect.
REVOKE ALL ON DATABASE :"agent_db" FROM PUBLIC;
