-- Schema-level grants for mealmaker_dev. MUST be run against the nutrition
-- database (the objects live there), e.g.:
--   psql -h localhost -U postgres -d nutrition -f script/db-setup-grants.sql
--
-- USAGE  : may look inside the schema.
-- CREATE : may create tables/indexes (needed for migrations).
--
-- ALTER DEFAULT PRIVILEGES is the part that is easy to forget: without it every
-- table created later by "postgres" would need granting again. It applies to
-- objects created BY THE ROLE RUNNING IT (postgres here), which is the normal
-- case when migrations are run as the superuser.

\set ON_ERROR_STOP on

GRANT USAGE, CREATE ON SCHEMA public TO mealmaker_dev;

-- Anything already present.
GRANT ALL ON ALL TABLES IN SCHEMA public TO mealmaker_dev;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO mealmaker_dev;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO mealmaker_dev;

-- Anything created later by postgres.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO mealmaker_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO mealmaker_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO mealmaker_dev;

-- Extensions this database will likely want for ingredient matching.
-- pg_trgm  : trigram similarity + GIN indexes (fuzzy "bread" -> "Bread, egg")
-- unaccent : accent-insensitive matching ("creme" -> "creme" from creme)
-- fuzzystrmatch: levenshtein/metaphone for extra tolerance
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
