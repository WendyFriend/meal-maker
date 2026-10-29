-- Accuracy check on real queries against the finished synonym data.
-- Reports what a cook would type, what resolves, and whether it is right.

\echo '=== 1. regional names a US-centric DB would miss ==='
WITH q(term, expect) AS (VALUES
    ('courgette',      'Squash, summer, zucchini'),
    ('aubergine',      'Eggplant'),
    ('rocket',         'Arugula'),
    ('prawns',         'Crustaceans, shrimp'),
    ('swede',          'Rutabaga'),
    ('mince',          'Beef, ground'),
    ('icing sugar',    'Sugars, powdered'),
    ('capsicum',       'Peppers, sweet'),
    ('coriander',      'Coriander'),
    ('chickpeas',      'Chickpeas'),
    ('garbanzo',       'Chickpeas'),
    ('treacle',        'Molasses'),
    ('broad beans',    'Fava beans'),
    ('spring onions',  'Onions, spring')
)
SELECT
    q.term,
    r.outcome,
    (SELECT left(s.description, 44)
     FROM search_food_syn(q.term, 1) s) AS best_match,
    (SELECT s.matched_via FROM search_food_syn(q.term, 1) s) AS via
FROM q, LATERAL search_resolution(q.term) r;

\echo ''
\echo '=== 2. the original complaints ==='
SELECT term, outcome FROM (
    VALUES ('bread'), ('tomatoes'), ('milk'), ('rice')
) v(term), LATERAL search_resolution(term);

\echo ''
\echo '=== 3. foods with only one term (weak coverage) ==='
SELECT count(*) AS foods_with_one_term
FROM (SELECT fdc_id FROM food_synonym GROUP BY fdc_id HAVING count(*) = 1) t;

\echo ''
\echo '=== 4. the 8 empty foods ==='
SELECT f.description, j.error
FROM synonym_job j JOIN food f USING (fdc_id)
WHERE j.status = 'empty';

\echo ''
\echo '=== 5. top rejection reasons ==='
SELECT reason, count(*) n FROM synonym_reject GROUP BY 1 ORDER BY n DESC LIMIT 10;
