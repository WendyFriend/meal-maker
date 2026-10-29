-- Every change made by db/lab/refine_deepseek.py, so each run can be reviewed and undone.
--   remove_synonym  the synonym row was moved to food_synonym_removed (detail holds the reasons)
--   add_synonym     a row was added to food_synonym with origin 'deepseek-refine'
--   skip_*          a proposal that was not applied, and why
--   note            run-level notes (caps hit, budget, model install decision)
--
-- Undo one run (replace <run>):
--   INSERT INTO food_synonym (id, fdc_id, term, origin, weight, is_bare_noun, rating_correct, rating_likely, rated_by, rated_at)
--   SELECT r.id, r.fdc_id, r.term, r.origin, r.weight, r.is_bare_noun, r.rating_correct, r.rating_likely, r.rated_by, r.rated_at
--   FROM food_synonym_removed r
--   WHERE r.id IN (SELECT (detail->>'synonym_id')::bigint FROM refine_log WHERE run_id = '<run>' AND action = 'remove_synonym');
--   DELETE FROM food_synonym_removed WHERE id IN (SELECT (detail->>'synonym_id')::bigint FROM refine_log WHERE run_id = '<run>' AND action = 'remove_synonym');
--   DELETE FROM food_synonym WHERE id IN (SELECT (detail->>'synonym_id')::bigint FROM refine_log WHERE run_id = '<run>' AND action = 'add_synonym');

CREATE TABLE IF NOT EXISTS refine_log (
    id         bigserial PRIMARY KEY,
    run_id     text NOT NULL,
    action     text NOT NULL,
    fdc_id     integer,
    term       text,
    detail     jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refine_log_run_idx ON refine_log (run_id, action);
