-- Create (or reset) the restricted dev role for the nutrition database.
--
-- Idempotent: safe to re-run. If the role already exists from an earlier
-- attempt, its password is reset to the one passed in, so the value written to
-- .env always matches.
--
-- The password is supplied by psql variable substitution, never hard-coded:
--   psql -h localhost -U postgres -d postgres -v pw=<generated> -f script/db-setup-role.sql
-- :'pw' renders it as a properly quoted SQL string literal.
--
-- Run against the "postgres" database: GRANT CONNECT is a cluster-level
-- privilege on the target database, so you do not need to be connected to it.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mealmaker_dev') THEN
        CREATE ROLE mealmaker_dev LOGIN;
    END IF;
END
$$;

ALTER ROLE mealmaker_dev LOGIN PASSWORD :'pw';

-- Only this one database, not the whole cluster.
GRANT CONNECT ON DATABASE nutrition TO mealmaker_dev;

-- Reassignment of ownership is intentionally NOT granted: the role can read
-- and write data, but cannot hand objects to other roles.
