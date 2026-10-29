-- Search that uses generated synonyms, in the intended order:
--
--   1. exact synonym match   - a cook typed a name we know
--   2. description prefix    - the food's own name
--   3. trigram similarity    - fuzzy fallback
--
-- The synonym layer is the whole point of the generation pass: without it,
-- "courgette" matches nothing, because USDA calls it "Squash, summer, zucchini".
--
-- Ambiguity is reported rather than silently resolved. When several foods match
-- a term equally, all are returned so the caller (or the user) can choose.
-- Deliberately no LLM here - this is the procedural path that should handle
-- most lookups.

CREATE OR REPLACE FUNCTION search_food_syn(q text, max_rows integer DEFAULT 20)
RETURNS TABLE (
    fdc_id      integer,
    description text,
    category    text,
    scope       text,
    kcal        numeric,
    protein_g   numeric,
    fat_g       numeric,
    carb_g      numeric,
    score       real,
    matched_via text
)
LANGUAGE sql STABLE AS $$
    WITH needle AS (
        SELECT lower(unaccent(trim(q))) AS term
    ),
    -- Foods whose generated synonyms contain the query exactly.
    by_synonym AS (
        SELECT
            s.fdc_id,
            -- A bare-noun claim outranks an ordinary synonym, and a curated
            -- manual term outranks a generated one. Weight carries that.
            1.00::real
                + CASE WHEN s.is_bare_noun THEN 0.05 ELSE 0 END
                + least((s.weight - 1.0) * 0.10, 0.10) AS score,
            ('synonym:' || s.term)::text AS matched_via
        FROM food_synonym s, needle
        WHERE lower(s.term) = needle.term
    ),
    -- Falls back to the trigram ranker for anything not covered.
    by_description AS (
        SELECT d.fdc_id, (d.score * 0.9)::real AS score, 'description'::text AS matched_via
        FROM search_food(q, max_rows) d
    ),
    combined AS (
        SELECT * FROM by_synonym
        UNION ALL
        SELECT b.fdc_id, b.score, b.matched_via
        FROM by_description b
        WHERE NOT EXISTS (SELECT 1 FROM by_synonym s WHERE s.fdc_id = b.fdc_id)
    ),
    best AS (
        SELECT DISTINCT ON (combined.fdc_id) *
        FROM combined
        ORDER BY combined.fdc_id, combined.score DESC
    )
    SELECT
        c.fdc_id,
        v.description,
        v.category,
        v.scope,
        v.kcal,
        v.protein_g,
        v.fat_g,
        v.carb_g,
        c.score,
        c.matched_via
    FROM best c
    JOIN v_food_core v ON v.fdc_id = c.fdc_id
    WHERE v.scope <> 'excluded'
    ORDER BY c.score DESC, length(v.description)
    LIMIT max_rows;
$$;

-- How well does a query resolve? Used by the explorer to show whether a
-- lookup would be unambiguous, ambiguous, or a miss.
CREATE OR REPLACE FUNCTION search_resolution(q text)
RETURNS TABLE (
    outcome      text,
    match_count  integer,
    best_score   real
)
LANGUAGE sql STABLE AS $$
    WITH hits AS (
        SELECT score FROM search_food_syn(q, 50)
    )
    SELECT
        CASE
            WHEN count(*) = 0 THEN 'no match'
            WHEN max(score) >= 1.0 AND count(*) FILTER (WHERE score >= 1.0) = 1 THEN 'exact'
            WHEN max(score) >= 1.0 THEN 'ambiguous'
            WHEN max(score) >= 0.5 THEN 'fuzzy'
            ELSE 'weak'
        END,
        count(*)::integer,
        coalesce(max(score), 0)::real
    FROM hits;
$$;
