-- Step 5: find the words that the resolver cannot handle well.
--
--   psql -d nutrition_lab -f db/lab/5_crowding.sql
--
-- Purpose: identify WHERE synonym quality is failing, not to fix it. A word is
-- "crowded" when a person typing it would get a long, mixed list rather than a
-- sensible single answer. Those words are the candidates for automatic
-- refinement; everything else can be left alone.
--
-- The unit of measurement is a WORD A PERSON TYPES, not a food row. That
-- distinction matters: "Rice bran, crude" and "Rice noodles, dry" are different
-- foods with different head phrases, but both answer the same typed word "rice".
-- Measuring by food hides the problem entirely -- 70 foods mention "rice", but
-- no single food row looks unusual.
--
-- Five independent signals, because crowding has several distinct causes:
--
--   hits            - how many foods the word matches at all
--   named_exactly   - how many foods are named exactly that word. A word with
--                     zero is a qualifier ("raw", "with"), not an ingredient.
--                       e.g. nothing is called just "butter", but 81 foods
--                       mention it; butter is a *form*, not an ingredient.
--   identity_ratio  - named_exactly / hits. Low means the word rarely names a
--                     food, it mostly modifies one. This is the signal that
--                     separates "rice" (0.41) from "salt" (0.00).
--   products        - foods that are products MADE FROM the word (powder,
--                     flour, noodle, cake, juice...). High means the word
--                     names a raw ingredient whose derived products outnumber it.
--   cats            - distinct USDA categories. High means unrelated things,
--                     not a family of variations.
--   owns            - whether a bare-noun synonym already claims the word. This
--                     is the one signal that is about OUR data rather than USDA's.
--
-- The composite score weights these into a single number for triage. The weights
-- are a judgement call, deliberately readable and easy to retune; they are not
-- fitted to anything.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE VIEW v_word_crowding AS
WITH exact AS (
    -- The word that names a food, i.e. its whole first segment.
    SELECT
        trim(split_part(lower(f.description), ',', 1)) AS word,
        f.fdc_id
    FROM food f
    WHERE f.scope <> 'excluded'
),
words AS (
    -- Candidates are words that name at least one food outright. This is the
    -- filter that keeps "with", "and", "reduced" out of the results: they never
    -- name a food, they only ever qualify one.
    SELECT word, count(*) AS named_exactly
    FROM exact
    WHERE word ~ '^[a-z]{3,}$'
    GROUP BY word
),
tokens AS (
    -- Every distinct word in every food name, expanded ONCE.
    --
    -- The obvious version -- one regex per candidate word, cross-joined over
    -- all foods -- costs 1.7s because it re-scans 7,793 descriptions ~360 times.
    -- Expanding each description into tokens once and joining on equality does
    -- the same work in one pass and measures identical numbers.
    SELECT DISTINCT
        f.fdc_id,
        tok AS word
    FROM food f
    CROSS JOIN LATERAL regexp_split_to_table(lower(f.description), '[^a-z]+') AS tok
    WHERE f.scope <> 'excluded'
      AND tok ~ '^[a-z]{3,}$'
),
matches AS (
    -- Everything a search for the word would surface, which is wider than the
    -- set of foods actually called that.
    SELECT
        t.word,
        f.fdc_id,
        lower(f.description) AS dsc,
        coalesce(c.description, '') AS category
    FROM tokens t
    JOIN words w ON w.word = t.word
    JOIN food f ON f.fdc_id = t.fdc_id
    LEFT JOIN food_category c ON c.id = f.food_category_id
),
agg AS (
    SELECT
        m.word,
        (SELECT named_exactly FROM words w2 WHERE w2.word = m.word) AS named_exactly,
        count(*) AS hits,
        count(DISTINCT m.category) AS categories,
        count(*) FILTER (
            -- The word itself is removed first, so "Butter, salted" is not
            -- counted as a product made from butter. Without this, every word
            -- that is also a product word scores as its own product.
            WHERE regexp_replace(m.dsc, '\m' || m.word || '\M', '', 'g')
                  ~ '\m(powder|flour|noodle|cake|cracker|chip|soup|juice|syrup|extract|dried|dehydrated|canned|frozen|babyfood|infant|bran|milk|drink|beverage|cereal|pasta|bread|wine|vinegar|oil|sauce|snack|dessert|pie|cookie|spread|substitute|butter|cheese|yogurt)\M'
        ) AS products,
        EXISTS (
            SELECT 1 FROM food_synonym s
            WHERE s.is_bare_noun AND lower(s.term) = m.word
        ) AS owns
    FROM matches m
    GROUP BY m.word
),
ratios AS (
    SELECT
        a.*,
        round(a.products::numeric / a.hits, 3)     AS product_ratio,
        round(a.named_exactly::numeric / a.hits, 3) AS identity_ratio
    FROM agg a
)
SELECT
    word,
    hits,
    named_exactly,
    identity_ratio,
    categories,
    products,
    product_ratio,
    owns,

    -- Why this word is hard, as a label rather than a score. A word can carry
    -- more than one label, which is the point: these are different problems
    -- needing different refinement methods.
    concat_ws(
        ' ',
        CASE WHEN named_exactly = 0 THEN 'qualifier-only' END,
        CASE WHEN named_exactly > 0 AND identity_ratio < 0.5 THEN 'rarely-names-a-food' END,
        CASE WHEN product_ratio >= 0.5 THEN 'product-dominated' END,
        CASE WHEN categories >= 4 THEN 'spread-across-categories' END,
        CASE WHEN NOT owns THEN 'no-bare-noun-owner' END
    ) AS problems,

    -- Triage score. Higher means a worse experience for the person typing it.
    round((
          ln(hits) * 4                        -- sheer volume
        + product_ratio * 30                  -- mostly things made from it
        + (1 - identity_ratio) * 20           -- the word modifies more than it names
        + (categories - 1) * 1.5              -- unrelated things, not variations
        + CASE WHEN owns THEN -15 ELSE 15 END -- already claimed by a synonym?
        - CASE WHEN owns THEN 0 ELSE 0 END
    )::numeric, 1) AS crowd
FROM ratios
WHERE hits >= 20;

COMMIT;

SELECT count(*) AS scored_words,
       count(*) FILTER (WHERE NOT owns) AS missing_an_owner,
       count(*) FILTER (WHERE problems LIKE '%product-dominated%') AS product_dominated
FROM v_word_crowding;
