-- Analysis of the anti-nutrient flagging output.
\echo '=== 1. overall flag counts by compound ==='
SELECT c.slug,
       c.evidence_level,
       count(*) FILTER (WHERE f.verdict = 'flagged') AS flagged,
       count(*) FILTER (WHERE f.verdict = 'dismissed') AS dismissed
FROM antinutrient_compound c
LEFT JOIN antinutrient_flag f ON f.compound_slug = c.slug
GROUP BY c.slug, c.evidence_level
ORDER BY flagged DESC NULLS LAST;

\echo ''
\echo '=== 2. total rows and rule coverage ==='
SELECT count(*) AS total_flags,
       count(DISTINCT fdc_id) AS foods_touched,
       count(DISTINCT compound_slug) AS compounds_covered,
       (SELECT count(*) FROM food) AS total_foods
FROM antinutrient_flag;

\echo ''
\echo '=== 3. did the animal dismissal work? ==='
SELECT fc.description AS category,
       count(*) FILTER (WHERE af.verdict = 'flagged') AS flagged,
       count(*) FILTER (WHERE af.verdict = 'dismissed') AS dismissed
FROM antinutrient_flag af
JOIN food f USING (fdc_id)
JOIN food_category fc ON fc.id = f.food_category_id
GROUP BY fc.description
ORDER BY flagged DESC;

\echo ''
\echo '=== 4. THE critical test: canned vs dry kidney beans ==='
SELECT left(f.description, 62) AS food, af.compound_slug, af.verdict, af.confidence
FROM antinutrient_flag af
JOIN food f USING (fdc_id)
WHERE f.description ILIKE '%kidney%'
  AND af.compound_slug IN ('lectins', 'phytates')
ORDER BY f.description, af.compound_slug
LIMIT 16;

\echo ''
\echo '=== 5. spinach: should be flagged for oxalates ==='
SELECT f.description, af.compound_slug, af.verdict
FROM antinutrient_flag af JOIN food f USING (fdc_id)
WHERE f.description = 'Spinach, raw' AND af.verdict = 'flagged'
ORDER BY af.compound_slug;

\echo ''
\echo '=== 6. beef: should be dismissed for everything plant ==='
SELECT f.description, af.compound_slug, af.verdict
FROM antinutrient_flag af JOIN food f USING (fdc_id)
WHERE f.description = 'Beef, grass-fed, ground, raw'
ORDER BY af.compound_slug;

\echo ''
\echo '=== 7. high-confidence flags per food (top foods) ==='
SELECT left(f.description, 55) AS food, count(*) AS flags,
       string_agg(af.compound_slug, ', ' ORDER BY af.compound_slug) AS compounds
FROM antinutrient_flag af JOIN food f USING (fdc_id)
WHERE af.verdict = 'flagged' AND af.confidence = 'high'
GROUP BY f.description
ORDER BY flags DESC, food
LIMIT 12;

\echo ''
\echo '=== 8. coverage: foods with at least one flag ==='
SELECT
    count(*) FILTER (WHERE has_flag) AS with_flag,
    count(*) FILTER (WHERE NOT has_flag) AS without_flag,
    count(*) AS total
FROM (
    SELECT f.fdc_id, bool_or(af.verdict = 'flagged') AS has_flag
    FROM food f LEFT JOIN antinutrient_flag af USING (fdc_id)
    GROUP BY f.fdc_id
) t;

\echo ''
\echo '=== 9. foods with NO rows at all (should be 0 - dismissal is explicit) ==='
SELECT count(*) AS foods_with_no_antinutrient_rows
FROM food f
WHERE NOT EXISTS (SELECT 1 FROM antinutrient_flag af WHERE af.fdc_id = f.fdc_id);
