-- How many foods shared the LLM call that wrote each prompt (1 = written on its own).
-- Written by db/lab/thumb_studio.py when it batches prompt generation.

ALTER TABLE food_thumbnail_prompt
    ADD COLUMN IF NOT EXISTS batch_size smallint NOT NULL DEFAULT 1;

-- `SELECT *` views are expanded when created, so recreate it to include batch_size.
CREATE OR REPLACE VIEW food_thumbnail_prompt_current AS
SELECT DISTINCT ON (fdc_id) *
FROM food_thumbnail_prompt
ORDER BY fdc_id, created_at DESC, id DESC;
