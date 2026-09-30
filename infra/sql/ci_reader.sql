-- Read-only role for the CI agent service (docs/adr/0002, ROADMAP T-03).
--
-- The agent may read ONLY the views in the `analytics` schema, which apps/web-ecommerce recreates on every start
-- (src/core/server/database/analytics/AnalyticsViews.ts). It gets no privilege on the shop's tables: the views
-- read them with their owner's rights.
--
-- Run once per database, as a role that may create roles (e.g. the postgres superuser):
--
--   psql -d <web database> \
--        -v web_role=<the exact role the web app connects as, i.e. DB_USERNAME in apps/web-ecommerce/.env> \
--        -v ci_reader_password=<a new secret; also goes into the agent's SHOP_READ_DSN> \
--        -f infra/sql/ci_reader.sql
--
-- `web_role` matters: the views are recreated by that role, and only the default privileges FOR ROLE web_role
-- make each new view readable by ci_reader again. Re-running the script is safe; the password is set each time.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE ci_reader LOGIN PASSWORD %L', :'ci_reader_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ci_reader') \gexec
ALTER ROLE ci_reader LOGIN PASSWORD :'ci_reader_password';

-- Every session of the role is read-only, whatever the client does.
ALTER ROLE ci_reader SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE :"DBNAME" TO ci_reader;

-- Owned by the web role so the web app can recreate the views in it.
CREATE SCHEMA IF NOT EXISTS analytics AUTHORIZATION :"web_role";
GRANT USAGE ON SCHEMA analytics TO ci_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO ci_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE :"web_role" IN SCHEMA analytics GRANT SELECT ON TABLES TO ci_reader;
