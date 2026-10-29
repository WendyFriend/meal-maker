-- Prompt generation for thumbnails, used by db/lab/thumb_studio.py.
--
-- gemma writes one image prompt per food from the food name (the `food.description`
-- column). The thumbnail generator only works on foods that have a prompt here and
-- no current thumbnail. Re-running a food with a new template adds a new row; the
-- latest row per food is the current prompt.

CREATE TABLE IF NOT EXISTS thumbnail_prompt_template (
    id          serial PRIMARY KEY,
    name        text NOT NULL,
    body        text NOT NULL UNIQUE,      -- the instruction sent to the LLM; {food name} is replaced
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_thumbnail_prompt (
    id           serial PRIMARY KEY,
    fdc_id       integer NOT NULL REFERENCES food(fdc_id),
    template_id  integer NOT NULL REFERENCES thumbnail_prompt_template(id),
    llm_model    text NOT NULL,            -- e.g. gemma4:12b
    food_name    text NOT NULL,            -- exactly what was substituted into the template
    prompt       text NOT NULL,            -- the cleaned positive prompt sent to the image model
    raw_response text NOT NULL,            -- the LLM's untouched reply
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_thumbnail_prompt_fdc_idx ON food_thumbnail_prompt (fdc_id, created_at DESC);

CREATE OR REPLACE VIEW food_thumbnail_prompt_current AS
SELECT DISTINCT ON (fdc_id) *
FROM food_thumbnail_prompt
ORDER BY fdc_id, created_at DESC, id DESC;

-- Which prompt produced each image.
ALTER TABLE food_thumbnail
    ADD COLUMN IF NOT EXISTS prompt_id integer REFERENCES food_thumbnail_prompt(id) ON DELETE SET NULL;

-- The view is `SELECT *`, expanded when created, so recreate it to include prompt_id.
CREATE OR REPLACE VIEW food_thumbnail_current AS
SELECT DISTINCT ON (fdc_id) *
FROM food_thumbnail
WHERE ok
ORDER BY fdc_id, created_at DESC;
