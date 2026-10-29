-- Accuracy spot-check on foods where being wrong actually matters.
-- Each row states the expectation and shows what the rules produced.
WITH checks(label, food_match, compound, expectation) AS (VALUES
    ('cassava raw -> cyanogens HIGH',        'Cassava, raw',                          'cyanogenic_glycosides', 'flagged'),
    ('kidney bean raw -> lectins',           'Beans, kidney, red, mature seeds, raw', 'lectins',    'flagged'),
    ('kidney bean canned -> lectins gone',   'Beans, kidney, red, mature seeds, canned, drained solids', 'lectins', 'dismissed'),
    ('spinach raw -> oxalates',              'Spinach, raw',                          'oxalates',   'flagged'),
    ('rhubarb raw -> oxalates',              'Rhubarb, raw',                          'oxalates',   'flagged'),
    ('beef -> oxalates none',                'Beef, grass-fed, ground, raw',          'oxalates',   'dismissed'),
    ('cheddar -> histamine',                 'Cheese, cheddar (Includes foods for USDA''s Food Distribution Program)', 'histamine',  'flagged'),
    ('egg white raw -> avidin',              'Egg, white, raw, fresh',                'avidin',     'flagged'),
    ('egg whole raw -> no avidin flag',      'Egg, whole, raw, fresh',                'avidin',     'dismissed'),
    ('broccoli -> goitrogens',               'Broccoli, raw',                         'goitrogens', 'flagged'),
    ('quinoa uncooked -> saponins',          'Quinoa, uncooked',                      'saponins',   'flagged'),
    ('liver -> purines',                     'Beef, variety meats and by-products, liver, raw', 'purines', 'flagged'),
    ('lard -> purines none',                 'Lard',                                  'purines',    'dismissed'),
    ('white rice raw -> phytates',           'Rice, white, long-grain, regular, raw, enriched', 'phytates', 'dismissed'),
    ('brown rice raw -> phytates',           'Rice, brown, long-grain, raw (Includes foods for USDA''s Food Distribution Program)', 'phytates', 'flagged'),
    ('onion -> fodmaps',                     'Onions, raw',                           'fodmaps',    'flagged')
)
SELECT
    c.label,
    c.expectation AS expected,
    coalesce(af.verdict::text, '(no row)') AS actual,
    CASE
        WHEN af.verdict = c.expectation THEN 'OK'
        WHEN af.verdict IS NULL THEN 'MISSING'
        ELSE 'WRONG'
    END AS result,
    af.confidence
FROM checks c
LEFT JOIN food f ON f.description = c.food_match
LEFT JOIN antinutrient_flag af ON af.fdc_id = f.fdc_id AND af.compound_slug = c.compound
ORDER BY result DESC, c.label;
