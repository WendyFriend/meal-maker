-- Common names and nouns, written by db/lab/naming.mjs.
--
--   psql -d nutrition_lab -f db/lab/8_naming.sql
--
-- common_name_raw / noun_raw: what the model gave each food, kept for review.
-- common_name / noun: the same value, but only on the ONE food that won it in
-- arbitration ("peas" belongs to one food, not fifty). A food that lost keeps
-- its raw value and has NULL here.
--
-- name_arbitration records every decision, so a paused run resumes without
-- re-deciding a term, and each winner can be traced to how it was picked.
--
-- Idempotent. Note 1_schema.sql drops food, so re-run this after a reload.

ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name_raw text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS noun_raw text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS noun text;

-- noun_raw before multi-word nouns were reduced to their base food ("durum wheat").
ALTER TABLE food ADD COLUMN IF NOT EXISTS noun_first text;

-- The same naming step by gemma4:12b, for comparing models (naming.mjs --run gemma).
ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name_gemma text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS noun_gemma text;

CREATE TABLE IF NOT EXISTS name_arbitration (
    kind        text NOT NULL CHECK (kind IN ('common', 'noun', 'common2', 'common3')),
    term        text NOT NULL,
    winner      integer REFERENCES food(fdc_id) ON DELETE CASCADE,
    candidates  integer NOT NULL,
    method      text NOT NULL,
    decided_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, term)
);

SELECT 'naming columns ready' AS status;

-- What the model said a bare search term most likely means, kept with the decision.
ALTER TABLE name_arbitration ADD COLUMN IF NOT EXISTS ideal text;

-- Second and third common names (regional or alternative names for the same food).
-- *_raw: what was accepted for the food (empty string = none), *: kept only by the
-- food that won the name in arbitration, like common_name.
ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name_2_raw text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name_2 text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name_3_raw text;
ALTER TABLE food ADD COLUMN IF NOT EXISTS common_name_3 text;

-- Existing databases: widen the kind check so other-name decisions can be stored.
ALTER TABLE name_arbitration DROP CONSTRAINT IF EXISTS name_arbitration_kind_check;
ALTER TABLE name_arbitration ADD CONSTRAINT name_arbitration_kind_check CHECK (kind IN ('common', 'noun', 'common2', 'common3'));

-- Synonym check: every decided name is asked "is <name> a synonym for <food>?".
-- checked marks a decision that passed. A food that failed is recorded in
-- name_rejected and never competes for that name again.
ALTER TABLE name_arbitration ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS name_rejected (
    kind   text NOT NULL,
    term   text NOT NULL,
    fdc_id integer NOT NULL,
    PRIMARY KEY (kind, term, fdc_id)
);

-- A bar made on one question only (before the second opinion) is unconfirmed;
-- the next run asks it again from the searcher's side.
ALTER TABLE name_rejected ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;
