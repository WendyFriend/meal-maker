-- Post-import integrity checks.
-- Run with: psql -f db/005_verify.sql
--
-- These are the assertions that matter: silent row loss is the failure mode
-- that would poison everything downstream, so it is checked explicitly rather
-- than assumed from a successful exit code.

\echo '=== 1. row counts: staging vs typed ==='
SELECT
    (SELECT count(*) FROM stg_food)          AS stg_food,
    (SELECT count(*) FROM food)              AS food,
    (SELECT count(*) FROM stg_food_nutrient) AS stg_food_nutrient,
    (SELECT count(*) FROM food_nutrient)     AS food_nutrient,
    (SELECT count(*) FROM stg_food_portion)  AS stg_food_portion,
    (SELECT count(*) FROM food_portion)      AS food_portion;

\echo ''
\echo '=== 2. was any food_nutrient row lost by the nutrient_nbr dedupe? ==='
-- Rows dropped only when two nutrient ids share a nutrient_nbr for the SAME
-- food. Anything else means a join or cast failure.
SELECT count(*) AS dropped_rows
FROM stg_food_nutrient s
JOIN stg_nutrient n ON n.id = s.nutrient_id
JOIN food f ON f.fdc_id = s.fdc_id::bigint
WHERE s.amount <> '' AND s.amount <> 'NA'
  AND s.amount ~ '^-?[0-9]*\.?[0-9]+$'
  AND NOT EXISTS (
      SELECT 1 FROM food_nutrient fn
      WHERE fn.fdc_id = s.fdc_id::bigint AND fn.nutrient_nbr = n.nutrient_nbr
  );

\echo ''
\echo '=== 3. nutrients defined vs actually reported ==='
SELECT
    (SELECT count(*) FROM nutrient)                       AS nutrients_defined,
    (SELECT count(DISTINCT nutrient_nbr) FROM food_nutrient) AS nutrients_reported,
    (SELECT count(*) FROM stg_nutrient)                  AS stg_nutrient_ids;

\echo ''
\echo '=== 4. foods with no kcal (should be 0) ==='
SELECT count(*) AS foods_missing_kcal
FROM food f
WHERE NOT EXISTS (
    SELECT 1 FROM food_nutrient fn
    WHERE fn.fdc_id = f.fdc_id AND fn.nutrient_nbr = '208'
);

\echo ''
\echo '=== 5. duplicate energy nutrient_nbrs (208 vs 268) - confirm both exist, use 208 only ==='
SELECT n.nutrient_nbr, n.name, n.unit, count(fn.*) AS rows
FROM nutrient n
LEFT JOIN food_nutrient fn ON fn.nutrient_nbr = n.nutrient_nbr
WHERE n.nutrient_nbr IN ('208', '268', '957', '958')
GROUP BY n.nutrient_nbr, n.name, n.unit
ORDER BY n.nutrient_nbr;

\echo ''
\echo '=== 6. scope distribution ==='
SELECT scope, count(*) AS foods
FROM food
GROUP BY scope
ORDER BY scope;

\echo ''
\echo '=== 7. anything outside 0-100g sanity bounds for macros? ==='
SELECT count(*) AS suspicious_macro_rows
FROM food_nutrient
WHERE nutrient_nbr IN ('203', '204', '205', '269', '291')
  AND (amount < 0 OR amount > 100);

\echo ''
\echo '=== 8. kcal range sanity (0-900) ==='
SELECT min(amount) AS min_kcal, max(amount) AS max_kcal, round(avg(amount)) AS avg_kcal
FROM food_nutrient WHERE nutrient_nbr = '208';

\echo ''
\echo '=== 9. portion gram_weight sanity ==='
SELECT min(gram_weight) AS min_g, max(gram_weight) AS max_g, count(*) AS portions
FROM food_portion;

\echo ''
\echo '=== 10. sample: does a plain whole food resolve correctly? ==='
SELECT description, category, scope, kcal, protein_g, fat_g, carb_g
FROM v_food_core
WHERE description IN (
    'Apples, raw, with skin (Includes foods for USDA''s Food Distribution Program)',
    'Chicken, broilers or fryers, breast, meat only, raw',
    'Spinach, raw',
    'Rice, white, long-grain, regular, raw, enriched'
)
ORDER BY description;
