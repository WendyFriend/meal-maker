-- Generated thumbnails for lab foods. One row per attempt, kept even when a
-- later attempt replaces the image on disk, so a food's history is traceable
-- (which model/prompt/seed made the picture a vision pass later flags as
-- wrong). The *current* image for a food is just <fdc_id>.webp in the
-- thumbnail folder; "current" here is the most recent row for that fdc_id.

CREATE TABLE IF NOT EXISTS food_thumbnail (
    id          serial PRIMARY KEY,
    fdc_id      integer NOT NULL REFERENCES food(fdc_id),
    label       text NOT NULL,       -- the cleaned food text actually sent as {food}
    source      text NOT NULL,       -- which column label came from: common_name / noun / description
    model       text NOT NULL,       -- sd15 / sdxl
    prompt      text NOT NULL,
    negative    text NOT NULL,
    seed        integer NOT NULL,
    steps       integer NOT NULL,
    cfg         real NOT NULL,
    size        integer NOT NULL,
    bytes       integer NOT NULL,
    ok          boolean NOT NULL DEFAULT true,   -- false = generation failed, no file
    error       text,
    -- filled in later by a vision-model QA pass; null = not assessed yet
    vision_verdict text,             -- e.g. good / wrong_food / low_quality / niche_placeholder_needed
    vision_note text,
    vision_model text,
    assessed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_thumbnail_fdc_idx ON food_thumbnail (fdc_id, created_at DESC);

-- The current thumbnail per food (most recent successful attempt).
CREATE OR REPLACE VIEW food_thumbnail_current AS
SELECT DISTINCT ON (fdc_id) *
FROM food_thumbnail
WHERE ok
ORDER BY fdc_id, created_at DESC;
