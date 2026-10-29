-- Schema for the independent lab copy.
--
-- Mirrors only what is needed to hold and inspect food rows and their synonyms.
-- No views, no resolver functions, no anti-nutrient rules: this is a place to
-- look at the data, not to replicate the application.
--
-- The one addition is `lab_source_of_truth`, empty on purpose. It is where a
-- human record of "what this food is really called, and what a search for it
-- should return" will live once we settle its shape.
--
-- Column names follow the source tables exactly, so a copied row means the same
-- thing in both databases.

\set ON_ERROR_STOP on

BEGIN;

DROP TABLE IF EXISTS lab_source_of_truth;
DROP TABLE IF EXISTS food_synonym;
DROP TABLE IF EXISTS food_nutrient;
DROP TABLE IF EXISTS food;
DROP TABLE IF EXISTS nutrient;
DROP TABLE IF EXISTS food_category;

CREATE TABLE food_category (
    id          integer PRIMARY KEY,
    description text
);

-- Keyed by nutrient_nbr: that is the natural key the source uses, and it has no
-- separate id column.
CREATE TABLE nutrient (
    nutrient_nbr text PRIMARY KEY,
    name         text,
    unit         text
);

CREATE TABLE food (
    fdc_id           integer PRIMARY KEY,
    description      text NOT NULL,
    food_category_id integer REFERENCES food_category(id),
    data_type        text,
    scope            text
);

CREATE TABLE food_nutrient (
    fdc_id       integer NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
    nutrient_nbr text    NOT NULL REFERENCES nutrient(nutrient_nbr),
    amount       numeric,
    PRIMARY KEY (fdc_id, nutrient_nbr)
);

CREATE TABLE food_synonym (
    id           bigserial PRIMARY KEY,
    fdc_id       integer NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
    term         text NOT NULL,
    origin       text,
    weight       real,
    is_bare_noun boolean NOT NULL DEFAULT false,
    CONSTRAINT food_synonym_uniq UNIQUE (fdc_id, term)
);

CREATE INDEX food_synonym_term_idx ON food_synonym (lower(term));
-- Mirrors the real database: only one food may own a bare word.
CREATE UNIQUE INDEX food_synonym_bare_uniq ON food_synonym (lower(term)) WHERE is_bare_noun;

-- The source of truth.
--
-- One row, empty for now. Every data column is nullable precisely because the
-- shape is undecided; a meaningful constraint gets added once it is settled.
CREATE TABLE lab_source_of_truth (
    id          bigserial PRIMARY KEY,
    fdc_id      integer REFERENCES food(fdc_id),
    -- The everyday name a person would say or type.
    common_name text,
    -- What searching that name ought to return, when it is not this row.
    search_term text,
    -- Anything a reviewer needs to justify the entry.
    notes       text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lab_source_of_truth DEFAULT VALUES;

COMMIT;
