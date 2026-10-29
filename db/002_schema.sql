-- Typed schema built from the staging tables.
-- Idempotent: drops and rebuilds, so re-running is always safe.

BEGIN;

DROP VIEW  IF EXISTS v_food_core;
DROP TABLE IF EXISTS food_portion  CASCADE;
DROP TABLE IF EXISTS food_nutrient CASCADE;
DROP TABLE IF EXISTS food           CASCADE;
DROP TABLE IF EXISTS nutrient        CASCADE;
DROP TABLE IF EXISTS food_category   CASCADE;

CREATE TABLE food_category (
    id          integer PRIMARY KEY,
    description text    NOT NULL
);

CREATE TABLE nutrient (
    -- '208' energy, '203' protein, ... Identical across FDC datasets.
    nutrient_nbr text PRIMARY KEY,
    name         text NOT NULL,
    unit         text NOT NULL
);

CREATE TABLE food (
    fdc_id           integer PRIMARY KEY,
    description      text    NOT NULL,
    food_category_id integer REFERENCES food_category(id),
    data_type        text    NOT NULL,
    -- Scope is a classification, not a deletion: excluded rows stay for audit
    -- and can be re-admitted by updating one column.
    scope            text    NOT NULL DEFAULT 'review'
                     CHECK (scope IN ('core', 'review', 'excluded'))
);

CREATE TABLE food_nutrient (
    fdc_id       integer NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
    nutrient_nbr text    NOT NULL REFERENCES nutrient(nutrient_nbr),
    amount       numeric NOT NULL,
    PRIMARY KEY (fdc_id, nutrient_nbr)
);

CREATE TABLE food_portion (
    portion_id  integer PRIMARY KEY,
    fdc_id      integer NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
    seq_num     integer,
    amount      numeric,
    description text,          -- e.g. 'cup prepared', 'slice 1 serving'
    gram_weight numeric NOT NULL CHECK (gram_weight > 0)
);

CREATE INDEX food_category_idx  ON food (food_category_id);
CREATE INDEX food_scope_idx     ON food (scope);
CREATE INDEX food_nutrient_nbr_idx ON food_nutrient (nutrient_nbr);
CREATE INDEX food_portion_fdc_idx  ON food_portion (fdc_id);

COMMIT;
