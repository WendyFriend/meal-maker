-- Synonym ratings, written by db/lab/rate-synonyms.mjs.
--
--   psql -d nutrition_lab -f db/lab/7_rating.sql
--
-- Two 1-5 scores from a local model, kept next to the synonym so the viewer can
-- show them. They are a ranking to review, not a verdict: nothing in the
-- resolver reads them. rated_by records model + prompt version so a later run
-- with a better prompt can be told apart from this one.
--
-- Idempotent. Note 1_schema.sql drops food_synonym, so re-run this after a reload.

ALTER TABLE food_synonym ADD COLUMN IF NOT EXISTS rating_correct smallint
    CHECK (rating_correct BETWEEN 1 AND 5);
ALTER TABLE food_synonym ADD COLUMN IF NOT EXISTS rating_likely smallint
    CHECK (rating_likely BETWEEN 1 AND 5);
ALTER TABLE food_synonym ADD COLUMN IF NOT EXISTS rated_by text;
ALTER TABLE food_synonym ADD COLUMN IF NOT EXISTS rated_at timestamptz;

SELECT 'rating columns ready' AS status;
