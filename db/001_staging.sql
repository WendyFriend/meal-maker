-- Foundational nutrition schema, derived from USDA FoodData Central SR Legacy.
--
-- Long-format by design: SR Legacy defines 474 nutrients and stores a median of
-- 85 per food, so one column per nutrient is not viable. nutrient_nbr (e.g.
-- '208', '203') is the stable key across FDC datasets; the internal nutrient.id
-- differs between SR Legacy and Foundation, so it is deliberately not used.
--
-- All statements are idempotent so this can be re-run.

BEGIN;

-- Staging tables mirror the CSV headers exactly, as text. The loader \copy's
-- the raw files here first, then typed tables are built by SQL. This keeps
-- CSV parsing inside PostgreSQL (which handles quoting and CRLF properly)
-- rather than in hand-written code.
DROP TABLE IF EXISTS stg_food_category;
DROP TABLE IF EXISTS stg_nutrient;
DROP TABLE IF EXISTS stg_food;
DROP TABLE IF EXISTS stg_food_nutrient;
DROP TABLE IF EXISTS stg_food_portion;

CREATE TABLE stg_food_category (
    id          text,
    code        text,
    description text
);

CREATE TABLE stg_nutrient (
    id           text,
    name         text,
    unit_name    text,
    nutrient_nbr text,
    rank         text
);

CREATE TABLE stg_food (
    fdc_id           text,
    data_type        text,
    description      text,
    food_category_id text,
    publication_date text
);

CREATE TABLE stg_food_nutrient (
    id                 text,
    fdc_id             text,
    nutrient_id        text,
    amount             text,
    data_points        text,
    derivation_id      text,
    min                text,
    max                text,
    median             text,
    footnote           text,
    min_year_acquired  text
);

CREATE TABLE stg_food_portion (
    id                 text,
    fdc_id             text,
    seq_num            text,
    amount             text,
    measure_unit_id    text,
    portion_description text,
    modifier           text,
    gram_weight        text,
    data_points        text,
    footnote           text,
    min_year_acquired  text
);

COMMIT;
