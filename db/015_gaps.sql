-- Narrowing down the two real problems.
\echo '=== A. uncovered VEGETABLES (490) - these should not be silent ==='
SELECT left(f.description, 58) AS food
FROM food f JOIN food_category fc ON fc.id = f.food_category_id
WHERE fc.description = 'Vegetables and Vegetable Products'
  AND NOT EXISTS (SELECT 1 FROM antinutrient_flag af WHERE af.fdc_id = f.fdc_id)
ORDER BY random() LIMIT 20;

\echo ''
\echo '=== B. uncovered FRUITS (243) ==='
SELECT left(f.description, 58) AS food
FROM food f JOIN food_category fc ON fc.id = f.food_category_id
WHERE fc.description = 'Fruits and Fruit Juices'
  AND NOT EXISTS (SELECT 1 FROM antinutrient_flag af WHERE af.fdc_id = f.fdc_id)
ORDER BY random() LIMIT 12;

\echo ''
\echo '=== C. how many uncovered are plain single-word plant foods? ==='
SELECT left(f.description, 50) AS food, fc.description AS cat
FROM food f JOIN food_category fc ON fc.id = f.food_category_id
WHERE NOT EXISTS (SELECT 1 FROM antinutrient_flag af WHERE af.fdc_id = f.fdc_id)
  AND f.description NOT LIKE '%,%'
  AND fc.description IN ('Vegetables and Vegetable Products', 'Fruits and Fruit Juices',
                          'Nut and Seed Products', 'Legumes and Legume Products',
                          'Cereal Grains and Pasta')
ORDER BY f.description LIMIT 20;

\echo ''
\echo '=== D. fats/oils entries NOT dismissed (the rule was too narrow) ==='
SELECT left(f.description, 62) AS food, count(*) AS flags
FROM food f JOIN food_category fc ON fc.id = f.food_category_id
JOIN antinutrient_flag af USING (fdc_id)
WHERE fc.description = 'Fats and Oils' AND af.verdict = 'flagged'
GROUP BY f.description ORDER BY food LIMIT 20;
