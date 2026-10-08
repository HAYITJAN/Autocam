-- Runs once when the PostgreSQL volume is first initialised.
-- Creates pg_trgm (as superuser) and a sibling "<db>_test" database for the pytest suite.
-- The initial Alembic migration also creates pg_trgm itself when the server provides it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

SELECT current_database() || '_test' AS test_db \gset

SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', current_user)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db')
\gexec

\connect :test_db
CREATE EXTENSION IF NOT EXISTS pg_trgm;
