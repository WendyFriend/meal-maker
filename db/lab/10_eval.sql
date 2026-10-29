-- The search evaluator's overlay (db/lab/evaluator.py).
--
--   psql -d nutrition_lab -f db/lab/10_eval.sql
--
-- The evaluator asks a local model whether search results are right and
-- proposes corrections. Everything it writes stays in the eval schema: it sees
-- its own corrections straight away, but nothing reaches the lab's search until
-- you accept and commit them in the app. Committing copies them into
-- search_pin, the first thing resolve_food checks.
--
-- Run 4_search.sql after this file the first time: resolve_food reads search_pin.
-- For a hard guarantee that the evaluator cannot touch anything else, give it
-- its own login with db/lab/eval-role.sql.

\set ON_ERROR_STOP on

BEGIN;

CREATE SCHEMA IF NOT EXISTS eval;

-- One row per worker session: which model, started how, and why it stopped.
CREATE TABLE IF NOT EXISTS eval.run (
    id          serial PRIMARY KEY,
    model       text NOT NULL,
    endpoint    text NOT NULL,
    mode        text NOT NULL CHECK (mode IN ('manual', 'auto')),
    started_at  timestamptz NOT NULL DEFAULT now(),
    ended_at    timestamptz,
    stop_reason text
);

-- Every query a model has judged. A query is skipped when the same model has
-- judged it against the same resolver version.
--   correct   the top result was right
--   corrected a runner-up was right (twice, with the list in a different order)
--   disputed  it picked different runners-up on the two asks
--   none      nothing in the list fits
--   empty     the search returned nothing
CREATE TABLE IF NOT EXISTS eval.judged (
    id               bigserial PRIMARY KEY,
    key              text NOT NULL,
    query            text NOT NULL,
    source           text NOT NULL,
    model            text NOT NULL,
    resolver_version text NOT NULL,
    verdict          text NOT NULL CHECK (verdict IN ('correct', 'corrected', 'disputed', 'none', 'empty')),
    resolved_fdc     integer,
    chosen_fdc       integer,
    run_id           integer REFERENCES eval.run (id),
    judged_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (key, model, resolver_version)
);

-- Proposed corrections: "this query should find this food". One open
-- proposal per query; another model agreeing adds itself to models, a model
-- disagreeing marks it conflict for review.
CREATE TABLE IF NOT EXISTS eval.correction (
    id          bigserial PRIMARY KEY,
    key         text NOT NULL,
    query       text NOT NULL,
    fdc_id      integer NOT NULL,
    was_fdc     integer,
    models      text[] NOT NULL,
    conflict    boolean NOT NULL DEFAULT false,
    run_id      integer REFERENCES eval.run (id),
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'committed')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS correction_open_key ON eval.correction (key) WHERE status IN ('pending', 'accepted');

-- Committed corrections: the lab's search answers these queries with this food.
CREATE TABLE IF NOT EXISTS search_pin (
    key          text PRIMARY KEY,
    query        text NOT NULL,
    fdc_id       integer NOT NULL,
    source       text NOT NULL,
    committed_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;

-- Pipelines (added after the first version; safe to re-run).
--   search  a query is judged on what the resolver returns for it
--   reach   a random food: what would a shopper type, and does that find it?
--   syn     a food_synonym row: is it really a name for that food?
ALTER TABLE eval.judged ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'search';
ALTER TABLE eval.judged ADD COLUMN IF NOT EXISTS target_fdc integer;
ALTER TABLE eval.judged DROP CONSTRAINT IF EXISTS judged_verdict_check;
ALTER TABLE eval.judged ADD CONSTRAINT judged_verdict_check
    CHECK (verdict IN ('correct', 'corrected', 'disputed', 'none', 'empty', 'kept', 'flagged'));

-- kind pin: "this query should find this food"; kind drop_synonym: "remove
-- this synonym from this food" (term holds the synonym).
ALTER TABLE eval.correction ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pin';
ALTER TABLE eval.correction DROP CONSTRAINT IF EXISTS correction_kind_check;
ALTER TABLE eval.correction ADD CONSTRAINT correction_kind_check CHECK (kind IN ('pin', 'drop_synonym'));
ALTER TABLE eval.correction ADD COLUMN IF NOT EXISTS term text;

-- Synonyms removed by a commit are kept here, so any of them can be put back.
CREATE TABLE IF NOT EXISTS food_synonym_removed (LIKE food_synonym INCLUDING DEFAULTS);
ALTER TABLE food_synonym_removed ADD COLUMN IF NOT EXISTS removed_at timestamptz NOT NULL DEFAULT now();

-- Second opinions on proposed changes, one row per reviewing model.
--   approve  the change is right (picked the proposed food both times)
--   reject   it is not (never picked the proposed food)
--   unsure   the two asks disagreed
CREATE TABLE IF NOT EXISTS eval.review (
    correction_id bigint NOT NULL REFERENCES eval.correction (id) ON DELETE CASCADE,
    model         text NOT NULL,
    verdict       text NOT NULL CHECK (verdict IN ('approve', 'reject', 'unsure')),
    run_id        integer REFERENCES eval.run (id),
    reviewed_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (correction_id, model)
);

-- The judging method that made a proposal (evaluator.py METHOD). Only proposals
-- from the current method, or ones you accepted, are laid over the evaluator's
-- searches; older ones stay for review without steering new judgements.
ALTER TABLE eval.correction ADD COLUMN IF NOT EXISTS method text;
-- not_needed: the current and the proposed food both pass, so the change is a wash.
ALTER TABLE eval.review DROP CONSTRAINT IF EXISTS review_verdict_check;
ALTER TABLE eval.review ADD CONSTRAINT review_verdict_check CHECK (verdict IN ('approve', 'reject', 'unsure', 'not_needed'));

SELECT 'eval overlay ready' AS status;
