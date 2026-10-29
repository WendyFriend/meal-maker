-- Schema additions for the LLM synonym pass.
--
-- Two things the earlier collision testing showed are needed structurally,
-- not just behaviourally:
--   1. A bare noun must belong to ONE food. A unique index enforces that at
--      insert time, so two foods cannot silently compete for "tomatoes".
--   2. Terms that legitimately belong to several foods (e.g. "snap beans" for
--      several green-bean rows) need recording as ambiguous rather than being
--      dropped or arbitrarily assigned.
--
-- Idempotent.

BEGIN;

-- Add the columns the batch job needs to food_synonym.
ALTER TABLE food_synonym
    ADD COLUMN IF NOT EXISTS is_bare_noun boolean NOT NULL DEFAULT false;

-- A term may only be a bare noun for one food. Partial index so ordinary
-- synonyms can still repeat across foods.
CREATE UNIQUE INDEX IF NOT EXISTS food_synonym_bare_noun_uniq
    ON food_synonym (lower(term))
    WHERE is_bare_noun;

-- Log of every term that was rejected, with the reason. Without this the same
-- junk is regenerated on every run and there is no way to tell a filter
-- rejection from a model failure.
DROP TABLE IF EXISTS synonym_reject;
CREATE TABLE synonym_reject (
    id          bigserial PRIMARY KEY,
    fdc_id      integer NOT NULL,
    description text    NOT NULL,
    term        text,
    reason      text    NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX synonym_reject_reason_idx ON synonym_reject (reason);

-- Progress tracking so a 7,793-food run is resumable and a failed food is
-- visible rather than silently missing.
DROP TABLE IF EXISTS synonym_job;
CREATE TABLE synonym_job (
    fdc_id       integer PRIMARY KEY,
    status       text NOT NULL CHECK (status IN ('pending', 'done', 'failed', 'empty')),
    terms_added  integer NOT NULL DEFAULT 0,
    error        text,
    model        text,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
