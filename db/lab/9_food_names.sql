-- Owned names: the lookup the resolver checks before anything else.
--
--   psql -d nutrition_lab -f db/lab/9_food_names.sql
--
-- Arbitration (db/lab/naming.mjs) left every common name, noun and other name
-- with exactly one owner. A query that matches one of those names is answered
-- by its owner, with no ranking or guessing. Run again after a naming run to
-- pick up new decisions; then re-run 4_search.sql only if it changed.
--
-- Plurals: a trailing s is ignored, so "peas" finds "pea" and "carrots" finds
-- "carrot" ("ies" -> "y", "oes" -> "o" and "es" after sh/ch/x/z/ss too:
-- berries, tomatoes, radishes, peaches). It is applied
-- to the query and the names alike, so "swiss" and "hummus" still compare equal.

\set ON_ERROR_STOP on

BEGIN;

-- The form a name and a query are compared in: lower case, no accents,
-- punctuation and hyphens as spaces, and each word without a plural ending.
CREATE OR REPLACE FUNCTION name_key(q text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(
               regexp_replace(
                   regexp_replace(
                       regexp_replace(
                       trim(regexp_replace(lower(unaccent(coalesce(q, ''))), '[^a-z0-9]+', ' ', 'g')),
                       '([a-z])ies\M', '\1y', 'g'),
                   '([a-z])oes\M', '\1o', 'g'),
                   '([a-z])(sh|ch|x|z|ss)es\M', '\1\2', 'g'),
               '([a-z][^s ])s\M', '\1', 'g');
$$;

-- Every name a food was given, whether it won it or not. A food that lost
-- "canned peas" is still a canned pea, so it ranks above foods that merely
-- contain the words.
DROP TABLE IF EXISTS food_name_any;
CREATE TABLE food_name_any AS
SELECT DISTINCT fdc_id, kind, name, name_key(name) AS key, string_to_array(name_key(name), ' ') AS words
FROM (
    SELECT fdc_id, 'noun' AS kind, noun_raw AS name FROM food WHERE noun_raw <> ''
    UNION ALL SELECT fdc_id, 'common', common_name_raw FROM food WHERE common_name_raw <> ''
    UNION ALL SELECT fdc_id, 'common2', common_name_2_raw FROM food WHERE common_name_2_raw <> ''
    UNION ALL SELECT fdc_id, 'common3', common_name_3_raw FROM food WHERE common_name_3_raw <> ''
) n
WHERE name_key(name) <> '';
CREATE INDEX food_name_any_words ON food_name_any USING gin (words);

-- One owner per key. Two owned names can share a key once plurals are
-- ignored, or a noun can equal a common name ("cheese"): the noun wins, as noun
-- arbitration was decided for exactly that bare-word search, then common
-- names, then second and third names.
DROP TABLE IF EXISTS food_name;
CREATE TABLE food_name AS
SELECT DISTINCT ON (key) key, words, name, fdc_id, kind
FROM (
    SELECT fdc_id, kind, name, name_key(name) AS key, string_to_array(name_key(name), ' ') AS words,
           CASE kind WHEN 'noun' THEN 1 WHEN 'common' THEN 2 WHEN 'common2' THEN 3 ELSE 4 END AS priority
    -- Owners come from the decisions, not the food columns: a food can win a
    -- name it carries only as a synonym ("rolled oats" -> Oats).
    FROM (SELECT winner AS fdc_id, kind, term AS name FROM name_arbitration) owned
) n
WHERE key <> ''
ORDER BY key, priority, fdc_id;
ALTER TABLE food_name ADD PRIMARY KEY (key);
CREATE INDEX food_name_words ON food_name USING gin (words);

COMMIT;

SELECT 'food names: ' || (SELECT count(*) FROM food_name) || ' owned keys, '
       || (SELECT count(*) FROM food_name_any) || ' names in all' AS status;
