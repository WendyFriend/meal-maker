-- Resolver with a full nutrition panel and anti-nutrient flags.
--
-- Widens the previous version so the lookup tool can show a detailed panel
-- without a second round trip. Two additions:
--   * the nutrients the app actually uses, plus the macro/micronutrient set a
--     cook would recognise
--   * anti-nutrient flags, as a JSON array, so one row carries everything the
--     single-card UI needs.

DROP FUNCTION IF EXISTS resolve_food_detailed(text, integer);

CREATE OR REPLACE FUNCTION resolve_food_detailed(q text, max_candidates integer DEFAULT 8)
RETURNS TABLE (
    fdc_id      integer,
    description text,
    category    text,
    scope       text,
    -- macros and energy
    kcal        numeric,
    protein_g   numeric,
    fat_g       numeric,
    carb_g      numeric,
    sugar_g     numeric,
    fiber_g     numeric,
    sat_fat_g   numeric,
    monofat_g   numeric,
    polyfat_g   numeric,
    trans_fat_g numeric,
    cholesterol_mg numeric,
    -- minerals
    sodium_mg   numeric,
    potassium_mg numeric,
    calcium_mg  numeric,
    iron_mg     numeric,
    magnesium_mg numeric,
    phosphorus_mg numeric,
    zinc_mg     numeric,
    -- vitamins
    vitamin_a_ug numeric,
    vitamin_c_mg numeric,
    vitamin_d_ug numeric,
    vitamin_e_mg numeric,
    vitamin_k_ug numeric,
    thiamin_mg  numeric,
    riboflavin_mg numeric,
    niacin_mg   numeric,
    b6_mg       numeric,
    folate_ug   numeric,
    b12_ug      numeric,
    -- other
    water_g     numeric,
    ash_g       numeric,
    caffeine_mg numeric,
    -- anti-nutrients
    antinutrients jsonb,
    score       real,
    matched_via text,
    tier        text
)
LANGUAGE sql STABLE AS $$
    WITH resolved AS (
        SELECT * FROM resolve_food(q, max_candidates)
    )
    SELECT
        r.fdc_id,
        r.description,
        r.category,
        r.scope,
        n.amount_kcal, n.protein_g, n.fat_g, n.carb_g,
        n.sugar_g, n.fiber_g, n.sat_fat_g, n.monofat_g, n.polyfat_g,
        n.trans_fat_g, n.cholesterol_mg,
        n.sodium_mg, n.potassium_mg, n.calcium_mg, n.iron_mg,
        n.magnesium_mg, n.phosphorus_mg, n.zinc_mg,
        n.vitamin_a_ug, n.vitamin_c_mg, n.vitamin_d_ug, n.vitamin_e_mg,
        n.vitamin_k_ug, n.thiamin_mg, n.riboflavin_mg, n.niacin_mg,
        n.b6_mg, n.folate_ug, n.b12_ug,
        n.water_g, n.ash_g, n.caffeine_mg,
        coalesce(a.flags, '[]'::jsonb) AS antinutrients,
        r.score, r.matched_via, r.tier
    FROM resolved r
    LEFT JOIN LATERAL (
        SELECT
            max(amount) FILTER (WHERE nutrient_nbr = '208') AS amount_kcal,
            max(amount) FILTER (WHERE nutrient_nbr = '203') AS protein_g,
            max(amount) FILTER (WHERE nutrient_nbr = '204') AS fat_g,
            max(amount) FILTER (WHERE nutrient_nbr = '205') AS carb_g,
            max(amount) FILTER (WHERE nutrient_nbr = '269') AS sugar_g,
            max(amount) FILTER (WHERE nutrient_nbr = '291') AS fiber_g,
            max(amount) FILTER (WHERE nutrient_nbr = '606') AS sat_fat_g,
            max(amount) FILTER (WHERE nutrient_nbr = '645') AS monofat_g,
            max(amount) FILTER (WHERE nutrient_nbr = '646') AS polyfat_g,
            max(amount) FILTER (WHERE nutrient_nbr = '605') AS trans_fat_g,
            max(amount) FILTER (WHERE nutrient_nbr = '601') AS cholesterol_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '307') AS sodium_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '306') AS potassium_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '301') AS calcium_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '303') AS iron_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '304') AS magnesium_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '305') AS phosphorus_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '309') AS zinc_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '320') AS vitamin_a_ug,
            max(amount) FILTER (WHERE nutrient_nbr = '401') AS vitamin_c_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '328') AS vitamin_d_ug,
            max(amount) FILTER (WHERE nutrient_nbr = '323') AS vitamin_e_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '430') AS vitamin_k_ug,
            max(amount) FILTER (WHERE nutrient_nbr = '404') AS thiamin_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '405') AS riboflavin_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '406') AS niacin_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '415') AS b6_mg,
            max(amount) FILTER (WHERE nutrient_nbr = '417') AS folate_ug,
            max(amount) FILTER (WHERE nutrient_nbr = '418') AS b12_ug,
            max(amount) FILTER (WHERE nutrient_nbr = '255') AS water_g,
            max(amount) FILTER (WHERE nutrient_nbr = '207') AS ash_g,
            max(amount) FILTER (WHERE nutrient_nbr = '262') AS caffeine_mg
        FROM food_nutrient
        WHERE fdc_id = r.fdc_id
    ) n ON true
    LEFT JOIN LATERAL (
        -- Only findings, not gaps or dismissals: the card should state what the
        -- food contains, not list everything it was checked for.
        SELECT jsonb_agg(
                   jsonb_build_object(
                       'compound', af.compound_slug,
                       'name', c.name,
                       'level', af.confidence,
                       'note', af.note,
                       'mitigation', c.mitigation
                   )
                   ORDER BY
                       CASE af.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                       af.compound_slug
               ) AS flags
        FROM antinutrient_flag af
        JOIN antinutrient_compound c ON c.slug = af.compound_slug
        WHERE af.fdc_id = r.fdc_id AND af.verdict = 'flagged'
    ) a ON true;
$$;
