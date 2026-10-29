-- Moves data from staging into the typed tables.
--
-- Notes on deliberate choices:
--  * Energy is read from '208' only. SR Legacy also stores energy as '268',
--    at 100% coverage; taking both would double every calorie figure.
--  * Rows with a blank amount are skipped rather than written as 0, because a
--    missing measurement is not the same as a measured zero.
--  * Scope rules are applied in SQL so they are reviewable and re-runnable.

BEGIN;

TRUNCATE food_category, nutrient, food, food_nutrient, food_portion CASCADE;

INSERT INTO food_category (id, description)
SELECT DISTINCT id::integer, description
FROM stg_food_category
WHERE id ~ '^\d+$';

INSERT INTO nutrient (nutrient_nbr, name, unit)
SELECT DISTINCT ON (nutrient_nbr) nutrient_nbr, name, unit_name
FROM stg_nutrient
WHERE nutrient_nbr <> ''
ORDER BY nutrient_nbr, id::integer DESC;

INSERT INTO food (fdc_id, description, food_category_id, data_type, scope)
SELECT
    s.fdc_id::bigint,
    s.description,
    NULLIF(s.food_category_id, '')::integer,
    s.data_type,
    CASE
        -- Whole-food categories plus generic sausages/luncheon meats.
        WHEN c.description IN (
            'Beef Products',
            'Vegetables and Vegetable Products',
            'Lamb, Veal, and Game Products',
            'Poultry Products',
            'Fruits and Fruit Juices',
            'Pork Products',
            'Dairy and Egg Products',
            'Legumes and Legume Products',
            'Finfish and Shellfish Products',
            'Fats and Oils',
            'Cereal Grains and Pasta',
            'Nut and Seed Products',
            'Spices and Herbs',
            'Sausages and Luncheon Meats'
        ) THEN 'core'
        -- Genuinely processed categories.
        WHEN c.description IN (
            'Sweets',
            'Baby Foods',
            'Fast Foods',
            'Snacks',
            'Restaurant Foods',
            'Meals, Entrees, and Side Dishes'
        ) THEN 'excluded'
        ELSE 'review'
    END
FROM stg_food s
LEFT JOIN stg_food_category c ON c.id = s.food_category_id
WHERE s.fdc_id ~ '^\d+$';

INSERT INTO food_nutrient (fdc_id, nutrient_nbr, amount)
SELECT
    s.fdc_id::bigint,
    n.nutrient_nbr,
    s.amount::numeric
FROM stg_food_nutrient s
JOIN stg_nutrient n ON n.id = s.nutrient_id
JOIN food f ON f.fdc_id = s.fdc_id::bigint
WHERE s.amount <> ''
  AND s.amount <> 'NA'
  AND s.amount ~ '^-?[0-9]*\.?[0-9]+$'
ON CONFLICT (fdc_id, nutrient_nbr) DO NOTHING;

INSERT INTO food_portion (portion_id, fdc_id, seq_num, amount, description, gram_weight)
SELECT
    s.id::bigint,
    s.fdc_id::bigint,
    NULLIF(s.seq_num, '')::integer,
    NULLIF(s.amount, '')::numeric,
    COALESCE(s.modifier, ''),
    s.gram_weight::numeric
FROM stg_food_portion s
JOIN food f ON f.fdc_id = s.fdc_id::bigint
WHERE s.gram_weight ~ '^-?[0-9]*\.?[0-9]+$'
  AND s.gram_weight::numeric > 0
ON CONFLICT (portion_id) DO NOTHING;

COMMIT;
