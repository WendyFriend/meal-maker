-- Step 2 of 2: load the CSVs into the LAB database.
--
--   psql -d nutrition_lab -f db/lab/3_load.sql
--
-- Safe to re-run: empties every table and reloads, so the lab always reflects
-- exactly what is in the CSV files. `food.source_of_truth` is wiped with the
-- rest of the row -- it is part of food, not a separate table.

\set ON_ERROR_STOP on

BEGIN;

TRUNCATE food_nutrient, food_synonym, food, nutrient, food_category RESTART IDENTITY CASCADE;

\copy food_category (id, description) FROM 'db/lab/out/food_category.csv' WITH (FORMAT csv, HEADER true)

\copy nutrient (nutrient_nbr, name, unit) FROM 'db/lab/out/nutrient.csv' WITH (FORMAT csv, HEADER true)

-- source_of_truth is omitted from the column list, so every reloaded row starts
-- with it NULL.
\copy food (fdc_id, description, food_category_id, data_type, scope) FROM 'db/lab/out/food.csv' WITH (FORMAT csv, HEADER true)

\copy food_nutrient (fdc_id, nutrient_nbr, amount) FROM 'db/lab/out/food_nutrient.csv' WITH (FORMAT csv, HEADER true)

-- id is exported and loaded verbatim so synonym ids match the source database.
\copy food_synonym (id, fdc_id, term, origin, weight, is_bare_noun) FROM 'db/lab/out/food_synonym.csv' WITH (FORMAT csv, HEADER true)

-- Keep the sequence ahead of the loaded ids, otherwise the next insert collides.
SELECT setval(
    pg_get_serial_sequence('food_synonym', 'id'),
    (SELECT COALESCE(max(id), 1) FROM food_synonym)
);

COMMIT;

SELECT 'food' AS object, count(*)::text AS rows FROM food
UNION ALL SELECT 'food_nutrient', count(*)::text FROM food_nutrient
UNION ALL SELECT 'food_synonym', count(*)::text FROM food_synonym
UNION ALL SELECT 'nutrient', count(*)::text FROM nutrient
UNION ALL SELECT 'food_category', count(*)::text FROM food_category;
