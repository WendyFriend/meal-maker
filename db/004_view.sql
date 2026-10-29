-- Convenience view: the ~12 nutrients the app actually consumes, pivoted wide.
-- Never exposes all 474 nutrients to client code.
--
-- Derived, not stored: thresholds such as "calorie dense" or "high protein"
-- belong in application config, computed from these values, so they can never
-- drift out of sync with the underlying measurements.
CREATE OR REPLACE VIEW v_food_core AS
SELECT
    f.fdc_id,
    f.description,
    f.scope,
    fc.description AS category,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '208') AS kcal,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '203') AS protein_g,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '204') AS fat_g,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '205') AS carb_g,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '269') AS sugar_g,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '291') AS fiber_g,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '606') AS sat_fat_g,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '601') AS cholesterol_mg,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '307') AS sodium_mg,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '306') AS potassium_mg,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '301') AS calcium_mg,
    max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '303') AS iron_mg
FROM food f
LEFT JOIN food_category fc ON fc.id = f.food_category_id
LEFT JOIN food_nutrient fn ON fn.fdc_id = f.fdc_id
GROUP BY f.fdc_id, f.description, f.scope, fc.description;
