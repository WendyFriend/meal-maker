-- Scope correction: sugar, syrup and leavening basics are core ingredients.
--
-- The category rule put everything in 'Sweets' into 'excluded', which was too
-- blunt. A recipe app needs icing sugar, molasses, honey, cocoa and baking
-- powder; they are staples, not confectionery. Meanwhile the actual sweets
-- (candies, cakes, chocolate bars) genuinely do not belong in an ingredient
-- picker.
--
-- Evidence: "icing sugar" and "treacle" returned no match purely because
-- 'Sugars, powdered' and 'Molasses' were scope 'excluded' and filtered out of
-- search. That is a scoping error, not a synonym gap.

BEGIN;

-- Baking and sweetening staples: promote to core.
UPDATE food
SET scope = 'core'
WHERE scope = 'excluded'
  AND description ~* '^(sugars?,|molasses|honey|syrups?,|cocoa,|baking powder|baking soda|leavening agents,|yeast,|cornstarch|salt,|pepper, black|vinegar,)';

-- Report what moved, so the change is auditable rather than silent.
\echo 'promoted to core:'
SELECT description FROM food WHERE scope = 'core' AND food_category_id = 21 ORDER BY description;

COMMIT;
