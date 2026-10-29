-- Step 3: the search algorithm, copied into the lab database.
--
--   psql -d nutrition_lab -f db/lab/4_search.sql
--
-- The lab is meant to be used for judging synonym quality, and judging it means
-- asking "what would the app actually return for this word?". That question is
-- only answerable with the real resolver present, not with a hand-written LIKE
-- query that approximates it.
--
-- These are the same objects the app uses, in the same order, with the same
-- bodies as db/007_search.sql and db/025_normalize_query.sql. If the app's
-- resolver changes, this file has to change with it -- the lab is a copy, not
-- an independent implementation.
--
-- Idempotent: every object is CREATE OR REPLACE, so re-running is safe.
--
-- Lab-only changes, not in the app yet: no food is filtered out by scope (every
-- food is searchable; scope is only a label), and resolve_food first checks the owned
-- names from naming arbitration (food_name, built by 9_food_names.sql), after
-- the evaluator's committed corrections (search_pin, 10_eval.sql). Both files
-- must be run before this one.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

BEGIN;

-- ---------------------------------------------------------------------------
-- The wide nutrient view the resolver reads from.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Query normalisation.
--
-- Spoken and typed input arrives with capitals, trailing punctuation and
-- plurals. Without this, "Tomato." misses the exact synonym tier entirely and
-- falls through to trigram guessing.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- The fuzzy fallback tier.
-- ---------------------------------------------------------------------------

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
        WHERE (
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

-- ---------------------------------------------------------------------------
-- The resolver itself: the single answer the app acts on.
--
-- Tiers, strongest first:
--   confident  - the query is a name one food owns ("flour", "canned peas"),
--                or exactly one food claims this word as a synonym
--   ambiguous  - several foods claim it, so the word alone is not enough
--   probable   - no synonym, but a food's name starts with the word
--   weak       - trigram guess only; the app hands this to the model instead
-- ---------------------------------------------------------------------------

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
    -- 0: names from arbitration, each owned by exactly one food. A whole match
    -- ("rye flour" is a name) answers outright. Failing that, an owned name
    -- containing every word of the query, fewest extra words first, then a
    -- name some other food was given but lost. The name must end in the same
    -- word as the query: "dark rye flour" is a rye flour, "vegetable oil milk"
    -- is not a vegetable oil. Plural endings are ignored on both sides
    -- (name_key).
    qkey AS (
        SELECT name_key(q) AS k, string_to_array(name_key(q), ' ') AS w
    ),
    -- An owned name is model-made. When the owner's description holds none of
    -- the query's words ("rolled oats" owned by "Cereals, CREAM OF RICE"), the
    -- name is unsupported: it drops below a synonym only one food claims and
    -- below a phrase only one description contains, which are the data's own
    -- words. It still beats every guessing tier.
    -- Corrections you reviewed and committed from the search evaluator
    -- (10_eval.sql): checked before everything else.
    pinned AS (
        SELECT p.fdc_id, 1.50::real AS score, ('pin:' || p.query)::text AS matched_via
        FROM search_pin p
        JOIN qkey ON p.key = qkey.k
    ),
    name_whole AS (
        SELECT fn.fdc_id,
               (CASE WHEN EXISTS (SELECT 1 FROM unnest(qkey.w) w
                                  WHERE ' ' || name_key(f.description) || ' ' LIKE '% ' || w || ' %')
                     THEN 1.30 ELSE 0.975 END)::real AS score,
               ('name:' || fn.kind || ':' || fn.name)::text AS matched_via
        FROM food_name fn
        JOIN qkey ON fn.key = qkey.k
        JOIN food f ON f.fdc_id = fn.fdc_id
    ),
    -- Exactly one food's description contains the query as a whole phrase. Just
    -- below a description that starts with it ("Radishes, raw" over "Radish
    -- seeds, sprouted"), above every guess.
    phrase_hits AS (
        SELECT f.fdc_id
        FROM food f, qkey
        WHERE qkey.k <> ''
          AND ' ' || name_key(f.description) || ' ' LIKE '% ' || qkey.k || ' %'
    ),
    unique_phrase AS (
        SELECT fdc_id, 0.96::real AS score, 'unique-phrase'::text AS matched_via
        FROM phrase_hits
        WHERE (SELECT count(*) FROM phrase_hits) = 1
    ),
    name_words AS (
        SELECT fn.fdc_id,
               greatest(1.24 - 0.03 * (cardinality(fn.words) - cardinality(qkey.w)), 1.16)::real AS score,
               ('name-words:' || fn.kind || ':' || fn.name)::text AS matched_via
        FROM food_name fn
        JOIN qkey ON fn.words @> qkey.w AND fn.key <> qkey.k
        JOIN food f ON f.fdc_id = fn.fdc_id
        WHERE cardinality(qkey.w) >= 2
          AND fn.words[cardinality(fn.words)] = qkey.w[cardinality(qkey.w)]
          AND EXISTS (SELECT 1 FROM unnest(qkey.w) w
                      WHERE ' ' || name_key(f.description) || ' ' LIKE '% ' || w || ' %')
    ),
    any_words AS (
        SELECT fa.fdc_id,
               greatest(1.12 - 0.02 * (cardinality(fa.words) - cardinality(qkey.w)), 1.04)::real AS score,
               ('any-name-words:' || fa.kind || ':' || fa.name)::text AS matched_via
        FROM food_name_any fa
        JOIN qkey ON fa.words @> qkey.w
        JOIN food f ON f.fdc_id = fa.fdc_id
        WHERE cardinality(qkey.w) >= 2
          AND fa.words[cardinality(fa.words)] = qkey.w[cardinality(qkey.w)]
          AND EXISTS (SELECT 1 FROM unnest(qkey.w) w
                      WHERE ' ' || name_key(f.description) || ' ' LIKE '% ' || w || ' %')
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
          ON lower(f.description) ~ ANY (
                 ARRAY(SELECT '\m' || v FROM unnest(query_variants(t.tok)) v)
             )
    ),
    tok_weight AS (
        SELECT
            t.tok,
            ln((SELECT count(*) FROM food)::real
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
        SELECT * FROM pinned
        UNION ALL SELECT * FROM name_whole
        UNION ALL SELECT * FROM unique_phrase
        UNION ALL SELECT * FROM name_words
        UNION ALL SELECT * FROM any_words
        UNION ALL SELECT * FROM exact_syn
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
                WHEN b.matched_via LIKE 'pin:%' THEN 'confident'
                WHEN b.matched_via LIKE 'name:%' AND b.score >= 1.29 THEN 'confident'
                WHEN b.matched_via LIKE 'name:%' THEN 'probable'
                WHEN b.matched_via = 'unique-phrase' THEN 'confident'
                WHEN b.matched_via LIKE 'name-words:%' OR b.matched_via LIKE 'any-name-words:%' THEN 'probable'
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
    ORDER BY t.score DESC, length(v.description)
    LIMIT max_candidates;
$$;

COMMIT;

SELECT 'search objects installed' AS status;
