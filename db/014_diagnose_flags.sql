-- Investigating false positives and coverage gaps from the first pass.
\echo '=== A. why is Beef flagged 14 times? (should be ~0) ==='
SELECT af.compound_slug, count(*) AS n,
       (array_agg(left(f.description, 42)))[1:3] AS examples
FROM antinutrient_flag af JOIN food f USING (fdc_id)
JOIN food_category fc ON fc.id = f.food_category_id
WHERE fc.description = 'Beef Products' AND af.verdict = 'flagged'
GROUP BY af.compound_slug ORDER BY n DESC;

\echo ''
\echo '=== B. why is Dairy/Egg flagged 123 times? ==='
SELECT af.compound_slug, count(*) AS n,
       (array_agg(left(f.description, 42)))[1:3] AS examples
FROM antinutrient_flag af JOIN food f USING (fdc_id)
JOIN food_category fc ON fc.id = f.food_category_id
WHERE fc.description = 'Dairy and Egg Products' AND af.verdict = 'flagged'
GROUP BY af.compound_slug ORDER BY n DESC;

\echo ''
\echo '=== C. why are Fats/Oils flagged 90 times? ==='
SELECT af.compound_slug, count(*) AS n,
       (array_agg(left(f.description, 42)))[1:3] AS examples
FROM antinutrient_flag af JOIN food f USING (fdc_id)
JOIN food_category fc ON fc.id = f.food_category_id
WHERE fc.description = 'Fats and Oils' AND af.verdict = 'flagged'
GROUP BY af.compound_slug ORDER BY n DESC;

\echo ''
\echo '=== D. the 2739 foods with no rows at all - which categories? ==='
SELECT fc.description AS category, count(*) AS uncovered
FROM food f
JOIN food_category fc ON fc.id = f.food_category_id
WHERE NOT EXISTS (SELECT 1 FROM antinutrient_flag af WHERE af.fdc_id = f.fdc_id)
GROUP BY fc.description ORDER BY uncovered DESC;

\echo ''
\echo '=== E. sample of uncovered foods ==='
SELECT left(f.description, 60) AS food, fc.description AS category
FROM food f JOIN food_category fc ON fc.id = f.food_category_id
WHERE NOT EXISTS (SELECT 1 FROM antinutrient_flag af WHERE af.fdc_id = f.fdc_id)
LIMIT 15;

\echo ''
\echo '=== F. sanity: is raw kidney bean high-confidence flagged for lectins? ==='
SELECT left(f.description, 55) AS food, af.verdict, af.confidence
FROM antinutrient_flag af JOIN food f USING (fdc_id)
WHERE f.description ILIKE 'beans, kidney%raw%' AND af.compound_slug = 'lectins';
