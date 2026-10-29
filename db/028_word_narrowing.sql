-- Search resolver: multi-word narrowing and whole-section matching.
--
-- 1. Multi-word searches: look the words up separately when the phrase fails.
--
-- "wagyu tenderloin" is not a phrase in any food name, so the resolver fell
-- through to a trigram guess and answered "Ostrich, tenderloin, raw" at a score
-- of 0.06. The foods exist ("Beef, ..., Wagyu, loin, tenderloin steak/roast").
--
-- New tier, between the description prefix and the fuzzy guess: each word is
-- searched on its own and a food scores by how much of the query it covers,
-- weighted so a rare word ("wagyu") counts for more than a common one
-- ("tenderloin"). A food holding every word is 'probable'. A food holding only
-- some is 'weak' but is ranked, so a misspelt or wrong word still leaves the
-- right neighbourhood instead of a random one.
--
-- resolve_food_detailed wraps resolve_food and needs no change.

BEGIN;

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
    -- 1 & 3: exact synonym hits, tolerant of punctuation and plurals.
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
    -- 2a: the first comma section IS the query: "Potatoes, raw" for "potato".
    -- The section before the first comma is what the food is called, so it is
    -- compared whole, and its plural or singular counts. A literal match
    -- outranks a plural one ("pepper" is not "peppers"), and a shorter name
    -- ("Potatoes, raw") outranks a longer one.
    head_section AS (
        SELECT
            f.fdc_id,
            (CASE WHEN trim(split_part(lower(f.description), ',', 1)) = nn.term
                  THEN 0.97 ELSE 0.93 END
             - least(length(f.description)::real / 400.0, 0.10))::real AS score,
            'head-section'::text AS matched_via
        FROM food f
        CROSS JOIN needle nn
        WHERE nn.term <> ''
          AND f.scope <> 'excluded'
          AND trim(split_part(lower(f.description), ',', 1)) = ANY (
                  ARRAY[nn.term, nn.term || 's', nn.term || 'es',
                        regexp_replace(nn.term, 'y$', 'ies'),
                        regexp_replace(nn.term, 'o$', 'oes')]
                  || nn.variants
              )
    ),
    -- 2b: the description starts with the query as whole words, e.g. "Potato
    -- flour" for "potato". The next character must end the word: "pepper" is
    -- not "peppermint".
    prefix AS (
        SELECT
            f.fdc_id,
            (0.85 - least(length(f.description)::real / 400.0, 0.10))::real AS score,
            'description-prefix'::text AS matched_via
        FROM food f
        CROSS JOIN needle nn
        WHERE nn.term <> ''
          AND f.scope <> 'excluded'
          AND left(lower(f.description), length(nn.term)) = nn.term
          AND substr(lower(f.description), length(nn.term) + 1, 1) !~ '[a-z0-9]'
    ),
    -- 4: several words, none of which is a phrase in any name ("wagyu
    -- tenderloin"). Each word is looked up on its own, and a food scores by how
    -- much of the query it covers, with rarer words counting for more: "wagyu"
    -- narrows to a few foods, "tenderloin" alone matches many. Narrowing by the
    -- rarest word first and then the next is the same as scoring by coverage,
    -- and it also ranks a partial cover (one word found, one misspelt) instead
    -- of dropping it.
    toks AS (
        SELECT DISTINCT t AS tok
        FROM needle nn,
             regexp_split_to_table(nn.term, '[^a-z0-9]+') t
        WHERE length(t) >= 2
          AND t NOT IN ('and', 'or', 'of', 'the', 'with', 'in', 'a', 'an')
    ),
    tok_hits AS (
        SELECT t.tok, f.fdc_id
        FROM toks t
        JOIN food f
          ON f.scope <> 'excluded'
         AND lower(f.description) ~ ANY (
                 ARRAY(SELECT '\m' || v FROM unnest(query_variants(t.tok)) v)
             )
    ),
    tok_weight AS (
        SELECT
            t.tok,
            ln((SELECT count(*) FROM food WHERE scope <> 'excluded')::real
               / greatest(count(DISTINCT h.fdc_id), 1)) + 1 AS w
        FROM toks t
        LEFT JOIN tok_hits h ON h.tok = t.tok
        GROUP BY t.tok
    ),
    words AS (
        SELECT
            h.fdc_id,
            (0.80 * sum(w.w) / (SELECT sum(w) FROM tok_weight))::real AS score,
            'words'::text AS matched_via
        FROM tok_hits h
        JOIN tok_weight w ON w.tok = h.tok
        WHERE (SELECT count(*) FROM toks) >= 2
        GROUP BY h.fdc_id
    ),
    -- 5: fuzzy fallback via trigram, using the normalised term so a stray full
    -- stop cannot drag the similarity score down.
    fuzzy AS (
        SELECT d.fdc_id, (d.score * 0.7)::real AS score, 'fuzzy'::text AS matched_via
        FROM needle nn
        CROSS JOIN LATERAL search_food(nn.term, max_candidates * 2) d
        WHERE nn.term <> ''
    ),
    combined AS (
        SELECT * FROM exact_syn
        UNION ALL SELECT * FROM head_section
        UNION ALL SELECT * FROM prefix
        UNION ALL SELECT * FROM words
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
                WHEN b.matched_via IN ('head-section', 'description-prefix') THEN 'probable'
                -- every word of the query was found: as good as a prefix match.
                WHEN b.matched_via = 'words' AND b.score >= 0.799 THEN 'probable'
                WHEN b.matched_via = 'words' THEN 'weak'
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
