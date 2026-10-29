-- A login for the search evaluator that can read the lab but write only to the
-- eval schema.
--
-- Normally run by script/setup-evaluator-db.ps1, which picks the password and
-- writes EVAL_DATABASE_URL to .env. By hand, as the postgres admin, after
-- 10_eval.sql:
--
--   psql -U postgres -d nutrition_lab -v pw=<password> -f db/lab/eval-role.sql
--
-- (without -v pw it asks), then add to .env:
--
--   EVAL_DATABASE_URL=postgresql://lab_evaluator:<password>@localhost:5432/nutrition_lab
--
-- The evaluator app then runs its worker as lab_evaluator, so a fault in the
-- worker cannot change food, names or search_pin: only "Commit" in the app,
-- which uses your normal login, writes to the lab.

\set ON_ERROR_STOP on
\if :{?pw}
\else
    \prompt 'Password for lab_evaluator: ' pw
\endif

SELECT format('CREATE ROLE lab_evaluator LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lab_evaluator') \gexec
ALTER ROLE lab_evaluator PASSWORD :'pw';

GRANT CONNECT ON DATABASE nutrition_lab TO lab_evaluator;
GRANT USAGE ON SCHEMA public TO lab_evaluator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lab_evaluator;
GRANT USAGE ON SCHEMA eval TO lab_evaluator;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA eval TO lab_evaluator;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA eval TO lab_evaluator;

-- Tables the lab scripts drop and recreate (food_name, food_synonym_key, ...)
-- keep the read grant.
ALTER DEFAULT PRIVILEGES FOR ROLE mealmaker_dev IN SCHEMA public GRANT SELECT ON TABLES TO lab_evaluator;
ALTER DEFAULT PRIVILEGES FOR ROLE mealmaker_dev IN SCHEMA eval GRANT SELECT, INSERT, UPDATE ON TABLES TO lab_evaluator;
ALTER DEFAULT PRIVILEGES FOR ROLE mealmaker_dev IN SCHEMA eval GRANT USAGE ON SEQUENCES TO lab_evaluator;
