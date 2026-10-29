-- Synonym layer: the target table for the planned LLM enrichment pass.
--
-- Kept separate from USDA data on purpose. Everything in `food`/`food_nutrient`
-- is derived mechanically from the CSV and can be rebuilt at any time; rows
-- here are generated or hand-written, so deleting them must never touch the
-- nutrition numbers.
--
-- Empty for now: this is the foundation pass. The columns exist so the
-- enrichment job has somewhere to write and so search can be widened later
-- without a schema change.
--
-- `origin` distinguishes sources so a bad LLM batch can be removed with a
-- single DELETE, leaving reviewed entries intact.

BEGIN;

CREATE TABLE IF NOT EXISTS food_synonym (
    id       bigserial PRIMARY KEY,
    fdc_id   integer NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
    term     text    NOT NULL,
    -- 'generated' = LLM output, 'manual' = reviewed by a human,
    -- 'usda' = a variant already present in USDA's own naming.
    origin   text    NOT NULL DEFAULT 'generated'
             CHECK (origin IN ('generated', 'manual', 'usda')),
    -- Optional weight so a curated term can outrank a generated one.
    weight   real    NOT NULL DEFAULT 1.0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fdc_id, term)
);

CREATE INDEX IF NOT EXISTS food_synonym_term_trgm_idx
    ON food_synonym USING gin (lower(term) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS food_synonym_fdc_idx ON food_synonym (fdc_id);

COMMIT;

/*
 * Search that also matches synonyms. Same shape as search_food so callers can
 * swap between them; synonym hits are scored slightly below a direct
 * description match so canonical names still win ties.
 */
CREATE OR REPLACE FUNCTION search_food_with_synonyms(q text, max_rows integer DEFAULT 20)
RETURNS TABLE (
    fdc_id      integer,
    description text,
    category    text,
    scope       text,
    kcal        numeric,
    protein_g   numeric,
    fat_g       numeric,
    carb_g      numeric,
    score       real,
    matched_via text
)
LANGUAGE sql STABLE AS $$
    WITH direct AS (
        SELECT s.*, 'description'::text AS matched_via FROM search_food(q, max_rows) s
    ),
    via_synonym AS (
        SELECT
            c.fdc_id, c.description, c.category, c.scope,
            c.kcal, c.protein_g, c.fat_g, c.carb_g,
            (0.9 * similarity(lower(syn.term), lower(unaccent(trim(q)))))::real AS score,
            ('synonym:' || syn.term)::text AS matched_via
        FROM food_synonym syn
        JOIN v_food_core c ON c.fdc_id = syn.fdc_id
        WHERE c.scope <> 'excluded'
          AND lower(syn.term) % lower(unaccent(trim(q)))
        ORDER BY score DESC
        LIMIT max_rows
    ),
    combined AS (
        SELECT * FROM direct
        UNION ALL
        SELECT * FROM via_synonym
    ),
    best_per_food AS (
        SELECT DISTINCT ON (combined.fdc_id) *
        FROM combined
        ORDER BY combined.fdc_id, combined.score DESC
    )
    SELECT fdc_id, description, category, scope, kcal, protein_g, fat_g, carb_g, score, matched_via
    FROM best_per_food
    ORDER BY score DESC
    LIMIT max_rows;
$$;
