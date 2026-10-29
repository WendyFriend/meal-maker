-- Fixes bare-word mappings that made everyday food look wrong.
--
-- Two separate problems, both visible on the card:
--
--   1. "tofu" resolved to fdc_id 169083, "Soybean, curd cheese". That string is
--      USDA's literal rendering of tofu (curd = bean curd), but as a display
--      name it reads like cheese and is indefensible on a card. The generated
--      synonym pass had picked it because nothing else claimed the bare word.
--
--   2. "egg", "milk" and "bread" had NO synonym at all. Without one they fell
--      to the description-prefix tier, which is a plain alphabetical match:
--        egg   -> "Eggnog"
--        milk  -> "Milk, low sodium, fluid"
--        bread -> "Bread, wheat"
--      Each of those is a different food from what a cook means.
--
-- The resolver treats a single distinct food holding an exact synonym as
-- 'confident' and skips the model entirely, so these rows are what stop a
-- model from guessing at the most common words in the whole database.
--
-- Idempotent: re-running updates the same rows and inserts nothing new.

BEGIN;

-- 1. Repoint every synonym spelled "tofu" at the plain regular tofu.
--    DELETE-then-INSERT rather than a bare UPDATE: the old generated row was
--    not flagged as a bare noun, so updating it would have left TWO foods
--    claiming the bare word and the resolver would call "tofu" ambiguous.
--    The unique index only covers is_bare_noun, so the stale row has to go.
DELETE FROM food_synonym
WHERE lower(term) = 'tofu'
  AND fdc_id = (
      SELECT fdc_id FROM food WHERE description = 'Soybean, curd cheese'
  );

INSERT INTO food_synonym (fdc_id, term, origin, weight, is_bare_noun)
SELECT f.fdc_id, 'tofu', 'manual', 1.5, true
FROM food f
WHERE f.description = 'Tofu, raw, regular, prepared with calcium sulfate'
ON CONFLICT (fdc_id, term) DO UPDATE
    SET origin = 'manual', weight = GREATEST(food_synonym.weight, 1.5), is_bare_noun = true;

-- 2. Give the staples that were missing a single canonical record each.
--    The target descriptions are pinned exactly, so this cannot silently
--    attach to a variant if USDA's naming shifts.
INSERT INTO food_synonym (fdc_id, term, origin, weight, is_bare_noun)
SELECT f.fdc_id, v.term, 'manual', 1.5, true
FROM food f
JOIN (VALUES
    -- Whole raw egg, not yolk, not white, not eggnog. 143 kcal per 100 g.
    ('Egg, whole, raw, fresh', 'egg'),
    ('Egg, whole, raw, fresh', 'eggs'),

    -- Whole milk, not low-sodium, not skim.
    ('Milk, whole, 3.25% milkfat, with added vitamin D', 'milk'),

    -- Standard commercial white loaf.
    ('Bread, white, commercially prepared (includes soft bread crumbs)', 'bread'),

    -- Tofu, also reachable as "bean curd".
    ('Tofu, raw, regular, prepared with calcium sulfate', 'bean curd')
) AS v(description, term) ON f.description = v.description
ON CONFLICT (fdc_id, term) DO UPDATE
    SET origin = 'manual',
        weight = GREATEST(food_synonym.weight, 1.5),
        is_bare_noun = true;

COMMIT;
