-- Follow-up investigations from the first verification pass.
\echo '=== A. duplicate nutrient_nbr in the catalog (462 distinct of 474 rows) ==='
SELECT nutrient_nbr, count(*) AS definitions, string_agg(name, ' | ' ORDER BY name) AS names
FROM stg_nutrient
GROUP BY nutrient_nbr
HAVING count(*) > 1
ORDER BY nutrient_nbr;

\echo ''
\echo '=== B. does 268 mean kJ, i.e. NOT a duplicate of 208? ==='
SELECT nutrient_nbr, name, unit, round(avg(amount)) AS avg_amount
FROM food_nutrient fn JOIN nutrient n USING (nutrient_nbr)
WHERE nutrient_nbr IN ('208','268')
GROUP BY nutrient_nbr, name, unit;

\echo ''
\echo '=== C. ratio 268/208 should be ~4.184 if kJ vs kcal ==='
SELECT round(avg(kj.amount / NULLIF(kcal.amount, 0)), 3) AS avg_kj_per_kcal
FROM food_nutrient kj
JOIN food_nutrient kcal ON kcal.fdc_id = kj.fdc_id AND kcal.nutrient_nbr = '208'
WHERE kj.nutrient_nbr = '268' AND kcal.amount > 10;

\echo ''
\echo '=== D. chicken breast descriptions actually present ==='
SELECT description, scope, kcal, protein_g
FROM v_food_core
WHERE description ILIKE 'chicken%breast%raw%'
ORDER BY description
LIMIT 8;

\echo ''
\echo '=== E. highest kcal foods (902 max seen) ==='
SELECT description, category, round(kcal) AS kcal
FROM v_food_core
WHERE kcal > 850
ORDER BY kcal DESC
LIMIT 8;

\echo ''
\echo '=== F. largest portion gram_weights (5717 g outlier) ==='
SELECT fp.gram_weight, fp.description, f.description AS food
FROM food_portion fp
JOIN food f USING (fdc_id)
ORDER BY fp.gram_weight DESC
LIMIT 6;

\echo ''
\echo '=== G. nutrients the app uses, coverage in core scope ==='
SELECT
    count(*) AS core_foods,
    count(kcal) AS has_kcal,
    count(protein_g) AS has_protein,
    count(fat_g) AS has_fat,
    count(carb_g) AS has_carb,
    count(fiber_g) AS has_fiber,
    count(sugar_g) AS has_sugar,
    count(sodium_mg) AS has_sodium
FROM v_food_core WHERE scope = 'core';
