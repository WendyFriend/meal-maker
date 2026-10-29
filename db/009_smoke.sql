-- Final end-to-end smoke test of the foundational nutrition database.
\echo '=== object inventory ==='
SELECT table_name AS object,
       (SELECT count(*) FROM information_schema.columns c
        WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS columns
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

\echo ''
\echo '=== views and functions ==='
SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name;
SELECT proname AS function_name, pg_get_function_arguments(oid) AS args
FROM pg_proc WHERE proname LIKE 'search_food%' ORDER BY proname;

\echo ''
\echo '=== scope x category (core only, top rows) ==='
SELECT category, count(*) AS foods
FROM v_food_core WHERE scope = 'core'
GROUP BY category ORDER BY foods DESC;

\echo ''
\echo '=== realistic lookup: 10 everyday ingredients ==='
WITH q(term) AS (VALUES
    ('chicken breast'), ('olive oil'), ('wholemeal bread'), ('greek yogurt'),
    ('canned tomatoes'), ('cheddar'), ('rolled oats'), ('sweet potato'),
    ('peanut butter'), ('lentils'))
SELECT q.term AS query,
       (SELECT left(s.description, 50) FROM search_food(q.term, 1) s) AS best_match,
       (SELECT round(s.kcal) FROM search_food(q.term, 1) s) AS kcal
FROM q;

\echo ''
\echo '=== per-100g -> per-serving conversion works? ==='
SELECT f.description,
       round(fn.amount) AS kcal_100g,
       fp.gram_weight AS portion_g,
       fp.description AS portion,
       round(fn.amount * fp.gram_weight / 100) AS kcal_per_portion
FROM food f
JOIN food_nutrient fn ON fn.fdc_id = f.fdc_id AND fn.nutrient_nbr = '208'
JOIN food_portion fp ON fp.fdc_id = f.fdc_id
WHERE f.description IN ('Bread, white, commercially prepared' , 'Apples, raw, with skin (Includes foods for USDA''s Food Distribution Program)')
ORDER BY f.description, fp.gram_weight
LIMIT 8;

\echo ''
\echo '=== energy is kcal only (no kJ leak into v_food_core) ==='
SELECT round(min(kcal)) AS min_kcal, round(max(kcal)) AS max_kcal,
       count(*) FILTER (WHERE kcal > 950) AS rows_over_950
FROM v_food_core;
