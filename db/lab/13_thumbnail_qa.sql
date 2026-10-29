-- Vision QA flag for thumbnails, written by db/lab/thumb_qa.py.
-- qa_rejected: 0 = accepted, 1 = rejected, NULL = not tested yet.
-- Set on the specific food_thumbnail row (image attempt) that was judged.

ALTER TABLE food_thumbnail
    ADD COLUMN IF NOT EXISTS qa_rejected smallint CHECK (qa_rejected IN (0, 1)),
    ADD COLUMN IF NOT EXISTS qa_name     text,         -- the cleaned name the judge was asked about
    ADD COLUMN IF NOT EXISTS qa_model    text,
    ADD COLUMN IF NOT EXISTS qa_at       timestamptz,
    ADD COLUMN IF NOT EXISTS qa_note     text;         -- the model's reasoning, or 'manual' for a hand override

-- The view is `SELECT *`, which Postgres expands at creation time, so it has
-- to be recreated to pick up the new columns.
CREATE OR REPLACE VIEW food_thumbnail_current AS
SELECT DISTINCT ON (fdc_id) *
FROM food_thumbnail
WHERE ok
ORDER BY fdc_id, created_at DESC;
