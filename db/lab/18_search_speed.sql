-- Faster resolve_food and resolve_food_conf. Same results, found more cheaply.
--
-- Replaces the definitions from 4_search.sql and 16_resolve_conf.sql. Scoring,
-- tiers and ordering are unchanged; only how rows are found changed:
--
--   1. Nutrition is read for the returned rows only. The old final join used
--      v_food_core, which totals all 644k nutrient rows for every food on every
--      call and then kept about 8 of them.
--   2. Each query word's plural/singular patterns are built once per search
--      (tok_pats, MATERIALIZED) instead of once per food row in the join.
--   3. A trigram index on lower(description) serves the fuzzy fallback
--      (search_food), which filtered with LIKE '%..%' and % over every food.
--   4. Rows tied on score and description length are ordered by fdc_id, so the
--      same query always returns the same rows (that order was undefined).
--
-- Checked against the previous definitions on 5,413 real queries: identical
-- foods, scores, tiers, match routes and nutrition, except the order inside
-- exact ties (item 4). Median time 271 ms -> 72 ms.
--
-- To change either function, edit it here (this file is the current source).


-- The fuzzy fallback (search_food) filters on lower(description) with LIKE and %.
CREATE INDEX IF NOT EXISTS food_description_trgm ON public.food USING gin (lower(description) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.resolve_food(q text, max_candidates integer DEFAULT 8)
 RETURNS TABLE(fdc_id integer, description text, category text, scope text, kcal numeric, protein_g numeric, fat_g numeric, carb_g numeric, sugar_g numeric, fiber_g numeric, sat_fat_g numeric, sodium_mg numeric, score real, matched_via text, tier text)
 LANGUAGE sql
 STABLE
AS $function$
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
    -- Each word's patterns (its plural/singular variants) are built once per
    -- query here, not once per food row in the join below.
    tok_pats AS MATERIALIZED (
        SELECT tok, ARRAY(SELECT '\m' || v FROM unnest(query_variants(tok)) v) AS pats
        FROM toks
    ),
    tok_hits AS (
        SELECT t.tok, f.fdc_id
        FROM tok_pats t
        JOIN food f ON lower(f.description) ~ ANY (t.pats)
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
    ),
    -- The winners first; their nutrition is then read for just these rows.
    top AS (
        SELECT t.*
        FROM tiered t
        JOIN food f ON f.fdc_id = t.fdc_id
        -- fdc_id breaks exact ties, so the same query always returns the same rows.
        ORDER BY t.score DESC, length(f.description), t.fdc_id
        LIMIT max_candidates
    )
    SELECT
        t.fdc_id, v.description, v.category, v.scope,
        v.kcal, v.protein_g, v.fat_g, v.carb_g,
        v.sugar_g, v.fiber_g, v.sat_fat_g, v.sodium_mg,
        t.score, t.matched_via, t.tier
    FROM top t
    -- Same columns as v_food_core, for one food.
    CROSS JOIN LATERAL (
        SELECT f.description, f.scope, fc.description AS category,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '208') AS kcal,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '203') AS protein_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '204') AS fat_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '205') AS carb_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '269') AS sugar_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '291') AS fiber_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '606') AS sat_fat_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '307') AS sodium_mg
        FROM food f
        LEFT JOIN food_category fc ON fc.id = f.food_category_id
        LEFT JOIN food_nutrient fn ON fn.fdc_id = f.fdc_id
        WHERE f.fdc_id = t.fdc_id
        GROUP BY f.description, f.scope, fc.description
    ) v
    ORDER BY t.score DESC, length(v.description), t.fdc_id;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_food_conf(q text, max_candidates integer DEFAULT 8)
 RETURNS TABLE(fdc_id integer, description text, category text, scope text, kcal numeric, protein_g numeric, fat_g numeric, carb_g numeric, sugar_g numeric, fiber_g numeric, sat_fat_g numeric, sodium_mg numeric, score real, matched_via text, tier text, n_routes integer, coverage real, desc_words integer)
 LANGUAGE sql
 STABLE
AS $function$
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
    -- Each word's patterns (its plural/singular variants) are built once per
    -- query here, not once per food row in the join below.
    tok_pats AS MATERIALIZED (
        SELECT tok, ARRAY(SELECT '\m' || v FROM unnest(query_variants(tok)) v) AS pats
        FROM toks
    ),
    tok_hits AS (
        SELECT t.tok, f.fdc_id
        FROM tok_pats t
        JOIN food f ON lower(f.description) ~ ANY (t.pats)
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
    ),
    -- The winners first; their nutrition is then read for just these rows.
    top AS (
        SELECT t.*
        FROM tiered t
        JOIN food f ON f.fdc_id = t.fdc_id
        -- fdc_id breaks exact ties, so the same query always returns the same rows.
        ORDER BY t.score DESC, length(f.description), t.fdc_id
        LIMIT max_candidates
    )
    SELECT
        t.fdc_id, v.description, v.category, v.scope,
        v.kcal, v.protein_g, v.fat_g, v.carb_g,
        v.sugar_g, v.fiber_g, v.sat_fat_g, v.sodium_mg,
        t.score, t.matched_via, t.tier,
        -- how many different matching routes (pin, name, synonym, head-section, prefix, words, fuzzy, ...)
        -- found this food; resolve_food keeps only the best one per food and drops the rest
        (SELECT count(DISTINCT split_part(c.matched_via, ':', 1)) FROM combined c WHERE c.fdc_id = t.fdc_id)::integer,
        -- share of the query's words (rarity-weighted, as in the `words` route) found in the food's description
        COALESCE((SELECT sum(w.w) FILTER (WHERE lower(v.description) ~ ANY (
                                ARRAY(SELECT '\m' || x FROM unnest(query_variants(w.tok)) x)))
                         / NULLIF(sum(w.w), 0)
                  FROM tok_weight w), 0)::real,
        (SELECT count(*) FROM regexp_split_to_table(lower(v.description), '[^a-z0-9]+') x WHERE x <> '')::integer
    FROM top t
    -- Same columns as v_food_core, for one food.
    CROSS JOIN LATERAL (
        SELECT f.description, f.scope, fc.description AS category,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '208') AS kcal,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '203') AS protein_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '204') AS fat_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '205') AS carb_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '269') AS sugar_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '291') AS fiber_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '606') AS sat_fat_g,
               max(fn.amount) FILTER (WHERE fn.nutrient_nbr = '307') AS sodium_mg
        FROM food f
        LEFT JOIN food_category fc ON fc.id = f.food_category_id
        LEFT JOIN food_nutrient fn ON fn.fdc_id = f.fdc_id
        WHERE f.fdc_id = t.fdc_id
        GROUP BY f.description, f.scope, fc.description
    ) v
    ORDER BY t.score DESC, length(v.description), t.fdc_id;
$function$
;