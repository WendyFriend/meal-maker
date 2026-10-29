-- Step 1 of 2: dump the WHOLE source database to CSV.
--
--   psql -d nutrition -f db/lab/2_select.sql
--
-- CSV rather than a cross-database copy because the two databases are separate
-- and no dblink/FDW is configured; a file keeps the copy inspectable and the
-- import repeatable.
--
-- \copy (not COPY) so paths resolve on the client and no superuser is needed.
--
-- Every row of every table is exported, in a stable order so a re-run produces
-- an identical file when nothing has changed.

\set ON_ERROR_STOP on

BEGIN;

\copy (SELECT id, description FROM food_category ORDER BY id) TO 'db/lab/out/food_category.csv' WITH (FORMAT csv, HEADER true)

\copy (SELECT nutrient_nbr, name, unit FROM nutrient ORDER BY nutrient_nbr) TO 'db/lab/out/nutrient.csv' WITH (FORMAT csv, HEADER true)

-- source_of_truth is not selected: it exists only in the lab database.
\copy (SELECT fdc_id, description, food_category_id, data_type, scope FROM food ORDER BY fdc_id) TO 'db/lab/out/food.csv' WITH (FORMAT csv, HEADER true)

\copy (SELECT fdc_id, nutrient_nbr, amount FROM food_nutrient ORDER BY fdc_id, nutrient_nbr) TO 'db/lab/out/food_nutrient.csv' WITH (FORMAT csv, HEADER true)

-- The source has an `id` and a `created_at` on food_synonym. created_at is
-- not exported: it is a booking timestamp, not data, and the lab table does
-- not carry it.
\copy (SELECT id, fdc_id, term, origin, weight, is_bare_noun FROM food_synonym ORDER BY id) TO 'db/lab/out/food_synonym.csv' WITH (FORMAT csv, HEADER true)

COMMIT;
