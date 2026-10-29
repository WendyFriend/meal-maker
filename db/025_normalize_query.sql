-- Query normalisation for the resolver.
--
-- Speech input does not arrive clean. A transcript of "tomato" comes back as
-- "Tomato." (capitalised, full stop), and people say plurals: "tomatoes",
-- "chickpeas", "carrots". Before this, both shapes missed the exact synonym
-- lookup, fell through to the trigram tier, and the model then guessed — for
-- "Tomato." it picked "Tomatoes, green, raw", which is not what anyone means by
-- tomato.
--
-- Fixing it here rather than in the client covers every entry point: typed,
-- pasted and spoken text all pass through resolve_food().
--
-- Two helpers plus a redefinition of resolve_food():
--
--   normalize_query()  - lowercase, unaccent, strip leading/trailing punctuation
--   query_variants()   - the normalised term plus plausible singular forms
--
-- Plural stripping is deliberately conservative. It only removes an ending it
-- recognises, and a variant that matches nothing is harmless, so a wrong guess
-- costs nothing while a right one recovers the confident tier. Endings in 'ss'
-- are left alone so "swiss" does not become "swis".

BEGIN;

CREATE OR REPLACE FUNCTION normalize_query(q text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    -- Trim punctuation from the ends only: interior characters ("tomato, red",
    -- "extra-virgin") are meaningful and must survive.
    SELECT regexp_replace(
               lower(unaccent(trim(coalesce(q, '')))),
               '^[^[:alnum:]]+|[^[:alnum:]]+$',
               '',
               'g'
           );
$$;

CREATE OR REPLACE FUNCTION query_variants(q text)
RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
    WITH n AS (
        SELECT normalize_query(q) AS term
    )
    SELECT coalesce(array_agg(DISTINCT v), ARRAY[]::text[])
    FROM (
        SELECT term AS v FROM n
        -- berries -> berry
        UNION ALL SELECT regexp_replace(term, 'ies$', 'y')
                  FROM n WHERE term ~ 'ies$'
        -- tomatoes -> tomato, potatoes -> potato
        UNION ALL SELECT regexp_replace(term, 'oes$', 'o')
                  FROM n WHERE term ~ 'oes$'
        -- dishes -> dish, boxes -> box, processes -> process
        UNION ALL SELECT regexp_replace(term, '(ses|xes|zes|ches|shes)$', '')
                  FROM n WHERE term ~ '(ses|xes|zes|ches|shes)$'
        -- carrots -> carrot, chickpeas -> chickpea. Skip 'ss' so "swiss" holds.
        UNION ALL SELECT left(term, -1)
                  FROM n WHERE term ~ '[^s]s$' AND term !~ 'ss$' AND length(term) > 3
    ) candidates
    WHERE coalesce(v, '') <> '';
$$;

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
        SELECT
            normalize_query(q) AS term,
            query_variants(q)  AS variants
    ),
    -- 1 & 3: exact synonym hits, now tolerant of punctuation and plurals.
    -- A literal hit outranks a plural-stemmed one, so "tomatoes" prefers the
    -- synonym actually spelled "tomatoes" when one exists.
    exact_syn AS (
        SELECT
            s.fdc_id,
            (1.00::real
             + CASE WHEN s.is_bare_noun THEN 0.05 ELSE 0 END
             + least((s.weight - 1.0) * 0.10, 0.10)
             - CASE WHEN lower(s.term) = nn.term THEN 0.0 ELSE 0.02 END)::real AS score,
            ('synonym:' || s.term)::text AS matched_via
        FROM food_synonym s
        CROSS JOIN needle nn
        WHERE lower(s.term) = ANY (nn.variants)
    ),
    -- 2: description starts with the query, e.g. "Spinach, raw" for "spinach".
    prefix AS (
        SELECT
            f.fdc_id,
            (0.90 - least(length(f.description)::real / 400.0, 0.10))::real AS score,
            'description-prefix'::text AS matched_via
        FROM food f
        CROSS JOIN needle nn
        WHERE nn.term <> ''
          AND f.scope <> 'excluded'
          AND lower(f.description) LIKE nn.term || '%'
    ),
    -- 4: fuzzy fallback via trigram. Uses the normalised term so a stray full
    -- stop cannot drag the similarity score down.
    fuzzy AS (
        SELECT d.fdc_id, (d.score * 0.7)::real AS score, 'fuzzy'::text AS matched_via
        FROM needle nn
        CROSS JOIN LATERAL search_food(nn.term, max_candidates * 2) d
        WHERE nn.term <> ''
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
    -- A single distinct food claiming the term is authoritative. Counting rows
    -- rather than foods would call "tomatoes" ambiguous the moment both the
    -- plural and the singular synonym point at the same record.
    tiered AS (
        SELECT b.*,
            CASE
                WHEN b.matched_via LIKE 'synonym:%'
                     AND (SELECT count(DISTINCT fdc_id) FROM exact_syn) = 1 THEN 'confident'
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

COMMIT;
