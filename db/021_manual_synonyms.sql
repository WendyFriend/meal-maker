-- Curated synonyms the model consistently failed to produce.
--
-- From the accuracy check in 020_synonym_accuracy.sql, these queries returned
-- "no match" or matched the wrong food:
--
--   icing sugar  -> no match    (USDA calls it "Sugars, powdered")
--   capsicum     -> no match    (USDA calls it "Peppers, sweet")
--   treacle      -> no match    (USDA calls it "Molasses")
--   mince        -> "Ham, minced"  (beef entries only got "beef mince")
--   swede        -> ambiguous
--
-- Regional vocabulary is exactly where an LLM is unreliable and a human is not,
-- so these are recorded as origin='manual' rather than 'generated'. The search
-- function scores manual terms slightly higher than generated ones.
--
-- Idempotent: re-running inserts nothing new.

BEGIN;

-- Helper: attach a term to every food whose description matches a pattern.
-- Terms are marked manual so a bad generated batch can be deleted without
-- touching them.
INSERT INTO food_synonym (fdc_id, term, origin, weight)
SELECT f.fdc_id, v.term, 'manual', 1.5
FROM food f
JOIN (VALUES
    -- Sugars, powdered. US "powdered sugar", UK/AU "icing sugar".
    ('^sugars, powdered', 'icing sugar'),
    ('^sugars, powdered', 'confectioners sugar'),
    ('^sugars, powdered', 'powdered sugar'),
    ('^sugars, powdered', 'icing mixture'),

    -- Peppers, sweet. AU/NZ/IN "capsicum".
    ('^peppers, sweet, green, raw', 'capsicum'),
    ('^peppers, sweet, green, raw', 'green capsicum'),
    ('^peppers, sweet, green, raw', 'bell pepper'),
    ('^peppers, sweet, red, raw', 'capsicum'),
    ('^peppers, sweet, red, raw', 'red capsicum'),
    ('^peppers, sweet, red, raw', 'bell pepper'),

    -- Molasses. UK "treacle" (black treacle).
    ('^molasses', 'treacle'),
    ('^molasses', 'black treacle'),

    -- Beef, ground. UK/AU "mince" / "beef mince". Plain "mince" is what a
    -- British cook types, so it belongs on the generic 85% lean entry, not on
    -- "Ham, minced".
    ('^beef, ground, 85% lean', 'mince'),
    ('^beef, ground, 85% lean', 'beef mince'),
    ('^beef, ground, 85% lean', 'ground beef'),
    ('^beef, ground, 80% lean', 'mince'),
    ('^beef, ground, 80% lean', 'beef mince'),

    -- Rutabaga. UK "swede", Scottish "neep". Not "turnip" - that is a
    -- different vegetable.
    ('^rutabagas?, raw', 'swede'),
    ('^rutabagas?, raw', 'neep'),
    ('^rutabagas?, raw', 'swedish turnip'),

    -- Fava beans. UK "broad beans".
    ('^beans, fava', 'broad beans'),
    ('^beans, fava', 'fava beans'),

    -- Courgette / zucchini, both directions.
    ('^squash, summer, zucchini', 'courgette'),
    ('^squash, summer, zucchini', 'zucchini'),

    -- Aubergine / eggplant.
    ('^eggplant', 'aubergine'),
    ('^eggplant', 'eggplant'),

    -- Arugula / rocket.
    ('^arugula', 'rocket'),
    ('^arugula', 'arugula'),
    ('^arugula', 'rucola'),

    -- Shrimp / prawns.
    ('^crustaceans, shrimp', 'prawns'),
    ('^crustaceans, shrimp', 'shrimp'),

    -- Cilantro / coriander.
    ('^coriander', 'cilantro'),
    ('^coriander', 'coriander')
) AS v(pattern, term) ON f.description ~* v.pattern
ON CONFLICT (fdc_id, term) DO UPDATE
    SET origin = 'manual', weight = GREATEST(food_synonym.weight, 1.5);

-- Raise search weight for manual terms so a curated name outranks a generated
-- one when both match.
CREATE INDEX IF NOT EXISTS food_synonym_weight_idx ON food_synonym (weight DESC);

COMMIT;
