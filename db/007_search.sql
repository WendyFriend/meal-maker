-- Search foundation: trigram index + ranked lookup function.
--
-- pg_trgm is enabled (verified earlier), so fuzzy matching is available without
-- any LLM. This exists to pre-filter candidates before any model arbitrates,
-- which keeps LLM calls small and lets most lookups skip the model entirely.
--
-- Deliberately does NOT implement synonyms: those belong in a separate
-- generated table later, so bad LLM output can be deleted without touching
-- USDA data.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

BEGIN;

-- Trigram index for similarity() and the % operator.
-- Partial on scope: 'excluded' rows are never offered to users, so indexing
-- them would waste space and slow writes.
CREATE INDEX IF NOT EXISTS food_description_trgm_idx
    ON food USING gin (lower(description) gin_trgm_ops)
    WHERE scope <> 'excluded';

-- Lowercased description for use by search without recomputing.
CREATE INDEX IF NOT EXISTS food_description_lower_idx
    ON food (lower(description));

COMMIT;

/*
 * Ranked fuzzy search over core/review foods.
 *
 * Returns the wide nutrient columns the app needs, plus a match score.
 *
 * Trigram similarity alone is weak here: 'Bread, rye' and 'Bread, egg' score
 * virtually identically against 'bread', and 'Tomato powder' scores higher
 * than raw tomatoes. Three deterministic signals correct most of that before
 * any model has to arbitrate:
 *
 *   1. head-noun match  - the query should be the leading word of USDA's name
 *   2. product-word penalty - 'powder', 'dried', 'soup', 'crackers' are
 *      products made from the ingredient, not the ingredient
 *   3. brevity bonus     - fewer qualifiers is closer to the bare ingredient
 */
CREATE OR REPLACE FUNCTION search_food(q text, max_rows integer DEFAULT 20)
RETURNS TABLE (
    fdc_id      integer,
    description text,
    category    text,
    scope       text,
    kcal        numeric,
    protein_g   numeric,
    fat_g       numeric,
    carb_g      numeric,
    score       real
)
LANGUAGE sql STABLE AS $$
    WITH needle AS (
        SELECT lower(unaccent(trim(q))) AS term
    ),
    scored AS (
        SELECT
            c.*,
            lower(c.description) AS dsc,
            (SELECT term FROM needle) AS term
        FROM v_food_core c
        WHERE c.scope <> 'excluded'
          AND (
              lower(c.description) LIKE '%' || (SELECT term FROM needle) || '%'
              OR lower(c.description) % (SELECT term FROM needle)
          )
    )
    SELECT
        s.fdc_id,
        s.description,
        s.category,
        s.scope,
        s.kcal,
        s.protein_g,
        s.fat_g,
        s.carb_g,
        (
            0.45 * CASE
                WHEN s.dsc LIKE s.term || '%' THEN 1.0
                WHEN s.dsc LIKE '%' || s.term || '%' THEN 0.6
                ELSE 0.0
            END
            + 0.30 * similarity(s.dsc, s.term)
            + 0.15 * CASE
                WHEN split_part(s.dsc, ',', 1) = s.term THEN 1.0
                WHEN split_part(s.dsc, ',', 2) LIKE s.term || '%' THEN 0.5
                ELSE 0.0
            END
            - 0.20 * CASE
                WHEN s.dsc ~ '\m(powder|dried|dehydrated|soup|crackers?|chips?|cookies?|cake|pie|syrup|juice|extract|infant|babyfood)\M'
                     AND s.term !~ '\m(powder|dried|dehydrated|soup|crackers?|chips?|cookies?|cake|pie|syrup|juice|extract)\M'
                THEN 1.0
                ELSE 0.0
            END
            - 0.05 * least(length(s.dsc) / 40.0, 1.0)
        )::real AS score
    FROM scored s
    ORDER BY score DESC
    LIMIT max_rows;
$$;
