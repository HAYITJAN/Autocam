-- Runs once when the PostgreSQL volume is first initialised.
-- Creates the required extensions and a sibling "<db>_test" database for the pytest suite.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

SELECT current_database() || '_test' AS test_db \gset

SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', current_user)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db')
\gexec

\connect :test_db
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
