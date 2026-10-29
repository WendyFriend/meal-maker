-- Measures duplication and detail-noise, to decide whether renaming is worth it
-- and how far names could safely be simplified.
--
-- The question: how many core foods are near-duplicates of one another, and how
-- much of each description is qualifier rather than identity?

\echo '=== 1. how many distinct head nouns are there, and how concentrated? ==='
SELECT
    lower(split_part(description, ',', 1)) AS head,
    count(*) AS variants
FROM food
WHERE scope = 'core'
GROUP BY 1
ORDER BY variants DESC
LIMIT 20;

\echo ''
\echo '=== 2. distribution: variants per head noun ==='
SELECT
    CASE
        WHEN variants = 1 THEN '1 (unique)'
        WHEN variants <= 3 THEN '2-3'
        WHEN variants <= 10 THEN '4-10'
        WHEN variants <= 30 THEN '11-30'
        ELSE '31+'
    END AS bucket,
    count(*) AS head_nouns,
    sum(variants) AS foods
FROM (
    SELECT lower(split_part(description, ',', 1)) AS head, count(*) AS variants
    FROM food WHERE scope = 'core'
    GROUP BY 1
) t
GROUP BY 1
ORDER BY min(variants);

\echo ''
\echo '=== 3. the worst offenders: heads with the most variants ==='
WITH heads AS (
    SELECT lower(split_part(description, ',', 1)) AS head, count(*) AS n
    FROM food WHERE scope = 'core'
    GROUP BY 1
    HAVING count(*) >= 25
)
SELECT h.head, h.n,
       (array_agg(f.description ORDER BY f.description))[1:4] AS examples
FROM heads h
JOIN food f ON lower(split_part(f.description, ',', 1)) = h.head AND f.scope = 'core'
GROUP BY h.head, h.n
ORDER BY h.n DESC
LIMIT 10;

\echo ''
\echo '=== 4. how long are descriptions? (detail noise) ==='
SELECT
    CASE
        WHEN parts = 1 THEN '1 part (bare)'
        WHEN parts = 2 THEN '2 parts'
        WHEN parts = 3 THEN '3 parts'
        WHEN parts <= 5 THEN '4-5 parts'
        ELSE '6+ parts'
    END AS complexity,
    count(*) AS foods
FROM (
    SELECT (length(description) - length(replace(description, ',', '')) + 1) AS parts
    FROM food WHERE scope = 'core'
) t
GROUP BY 1
ORDER BY min(parts);

\echo ''
\echo '=== 5. are the long descriptions nutritionally distinct? ==='
-- If two foods in the same head have identical macros, merging them is safe.
-- If macros differ materially, merging is data loss.
WITH pairs AS (
    SELECT
        lower(split_part(a.description, ',', 1)) AS head,
        a.fdc_id AS a_id, b.fdc_id AS b_id,
        abs(
            coalesce((SELECT amount FROM food_nutrient WHERE fdc_id = a.fdc_id AND nutrient_nbr = '208'), 0)
          - coalesce((SELECT amount FROM food_nutrient WHERE fdc_id = b.fdc_id AND nutrient_nbr = '208'), 0)
        ) AS kcal_diff
    FROM food a
    JOIN food b
      ON lower(split_part(a.description, ',', 1)) = lower(split_part(b.description, ',', 1))
     AND a.fdc_id < b.fdc_id
    WHERE a.scope = 'core' AND b.scope = 'core'
)
SELECT
    count(*) AS same_head_pairs,
    count(*) FILTER (WHERE kcal_diff = 0) AS identical_kcal,
    count(*) FILTER (WHERE kcal_diff <= 5) AS within_5_kcal,
    count(*) FILTER (WHERE kcal_diff > 50) AS differ_over_50_kcal,
    round(100.0 * count(*) FILTER (WHERE kcal_diff <= 5) / nullif(count(*), 0), 1) AS pct_safe_to_merge
FROM pairs;
