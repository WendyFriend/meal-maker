-- Resolves user text to ONE food, using rules first and leaving ambiguity to
-- the caller (which may ask an LLM).
--
-- The split matters: most lookups are unambiguous and need no model. Only when
-- several foods claim the same term does the caller need help.
--
-- Resolution tiers, strongest first:
--   1. unique exact synonym      -> confident, no LLM
--   2. unique description prefix -> confident, no LLM
--   3. several exact synonyms    -> ambiguous, ask the LLM
--   4. partial synonym/trigram   -> weak, ask the LLM
--   5. nothing                   -> no match

CREATE OR REPLACE FUNCTION resolve_food(q text, max_candidates integer DEFAULT 8)
RETURNS TABLE (
    fdc_id      integer,
    description text,
    category    text,
    scope       text,
    kcal        numeric,
    protein_g   numeric,
    fat_g       numeric,
    carb_g      numeric,
    sugar_g     numeric,
    fiber_g     numeric,
    sat_fat_g   numeric,
    sodium_mg   numeric,
    score       real,
    matched_via text,
    tier        text
)
LANGUAGE sql STABLE AS $$
    WITH needle AS (
        SELECT lower(unaccent(trim(q))) AS term
    ),
    -- 1 & 3: exact synonym hits.
    exact_syn AS (
        SELECT
            s.fdc_id,
            (1.00::real
             + CASE WHEN s.is_bare_noun THEN 0.05 ELSE 0 END
             + least((s.weight - 1.0) * 0.10, 0.10))::real AS score,
            ('synonym:' || s.term)::text AS matched_via
        FROM food_synonym s, needle
        WHERE lower(s.term) = needle.term
    ),
    -- 2: description starts with the query, e.g. "Spinach, raw" for "spinach".
    prefix AS (
        SELECT
            f.fdc_id,
            (0.90 - least(length(f.description)::real / 400.0, 0.10))::real AS score,
            'description-prefix'::text AS matched_via
        FROM food f, needle
        WHERE f.scope <> 'excluded'
          AND lower(f.description) LIKE needle.term || '%'
    ),
    -- 4: fuzzy fallback via trigram.
    fuzzy AS (
        SELECT d.fdc_id, (d.score * 0.7)::real AS score, 'fuzzy'::text AS matched_via
        FROM search_food(q, max_candidates * 2) d
    ),
    combined AS (
        SELECT * FROM exact_syn
        UNION ALL SELECT * FROM prefix
        UNION ALL SELECT * FROM fuzzy
    ),
    best AS (
        SELECT DISTINCT ON (combined.fdc_id) *
        FROM combined
        ORDER BY combined.fdc_id, combined.score DESC
    ),
    -- A single exact-synonym hit is authoritative; anything else is a guess.
    tiered AS (
        SELECT b.*,
            CASE
                WHEN b.matched_via LIKE 'synonym:%'
                     AND (SELECT count(*) FROM exact_syn) = 1 THEN 'confident'
                WHEN b.matched_via LIKE 'synonym:%' THEN 'ambiguous'
                WHEN b.matched_via = 'description-prefix' THEN 'probable'
                ELSE 'weak'
            END AS tier
        FROM best b
    )
    SELECT
        t.fdc_id, v.description, v.category, v.scope,
        v.kcal, v.protein_g, v.fat_g, v.carb_g,
        v.sugar_g, v.fiber_g, v.sat_fat_g, v.sodium_mg,
        t.score, t.matched_via, t.tier
    FROM tiered t
    JOIN v_food_core v ON v.fdc_id = t.fdc_id
    WHERE v.scope <> 'excluded'
    ORDER BY t.score DESC, length(v.description)
    LIMIT max_candidates;
$$;
