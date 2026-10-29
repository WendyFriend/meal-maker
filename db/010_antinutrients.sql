-- Anti-nutrient flagging foundation.
--
-- Deliberately rule-based, not LLM-based. USDA defines oxalic acid (245),
-- phytic acid (246), raffinose (288) and stachyose (289) but populates ZERO
-- rows for all of them, and lectins/tannins/saponins/goitrogens are not in the
-- dictionary at all. So there is nothing to query: every (food, compound) pair
-- must be derived from what the food IS, using category plus name.
--
-- Three tables:
--   antinutrient_compound  the vocabulary
--   antinutrient_rule      category + name regex -> verdict
--   antinutrient_flag      the outcome per food, including dismissals
--
-- Dismissals are recorded, not skipped. Without that the job is not idempotent
-- and every re-run re-proposes the same items, so a review queue never clears.
--
-- Idempotent: rules are replaced wholesale, flags regenerated.

BEGIN;

DROP TABLE IF EXISTS antinutrient_flag;
DROP TABLE IF EXISTS antinutrient_rule;
DROP TABLE IF EXISTS antinutrient_compound;

CREATE TABLE antinutrient_compound (
    slug           text PRIMARY KEY,
    name           text NOT NULL,
    -- What a person should actually do about it. For most of these the answer
    -- is a preparation step, not a number, which is why they are qualitative.
    mitigation     text NOT NULL,
    -- 'sourced' = per-food tables exist somewhere; 'qualitative' = no tabulated
    -- per-food data exists and a bucket is the honest output.
    evidence_level text NOT NULL CHECK (evidence_level IN ('sourced', 'qualitative'))
);

INSERT INTO antinutrient_compound (slug, name, mitigation, evidence_level) VALUES
    ('phytates', 'Phytates (phytic acid)',
     'Soak, sprout, or ferment (sourdough); milling removes bran where most phytate sits.',
     'sourced'),
    ('oxalates', 'Oxalates (oxalic acid)',
     'Boil and discard the water (30-50% reduction); avoid pairing with calcium supplements.',
     'sourced'),
    ('tannins', 'Tannins (proanthocyanidins)',
     'Sprout, ferment; milk or other protein binds them. Tea reduces iron uptake if drunk with meals.',
     'sourced'),
    ('lectins', 'Lectins (phytohaemagglutinin)',
     'Boil hard for at least 10 minutes. Slow cookers are unsafe for kidney beans.',
     'qualitative'),
    ('protease_inhibitors', 'Protease (trypsin) inhibitors',
     'Adequate moist heat inactivates them; soaking alone does not.',
     'qualitative'),
    ('goitrogens', 'Goitrogens (glucosinolates)',
     'Cooking partially reduces them; steaming less than boiling. Matters mainly with low iodine intake.',
     'qualitative'),
    ('cyanogenic_glycosides', 'Cyanogenic glycosides',
     'Cassava must be peeled, soaked and thoroughly cooked; never eat raw. Flaxseed should be ground and heated.',
     'qualitative'),
    ('glycoalkaloids', 'Glycoalkaloids (solanine, chaconine)',
     'Discard green or sprouted potato and all potato skin where greened. Not destroyed by cooking.',
     'qualitative'),
    ('saponins', 'Saponins',
     'Rinse quinoa before cooking; soaking and cooking reduce them.',
     'qualitative'),
    ('avidin', 'Avidin',
     'Heat denatures it; raw egg white binds biotin.',
     'qualitative'),
    ('purines', 'Purines',
     'Not removed by cooking. Relevant to gout management.',
     'qualitative'),
    ('histamine', 'Histamine / tyramine',
     'Arise from ageing and fermentation, so not heat-stable. Freshness matters more than cooking.',
     'qualitative'),
    ('salicylates', 'Salicylates',
     'Can accumulate in fats and spices. Relevant to sensitivity, not toxicity.',
     'qualitative'),
    ('sulfites', 'Sulfites',
     'Added during drying and winemaking, not naturally present in the fresh food.',
     'qualitative'),
    ('coumarin', 'Coumarin',
     'Ceylon cinnamon is low; Cassia is high. Hepatotoxic only at sustained high intake.',
     'qualitative'),
    ('nickel', 'Nickel',
     'Relevant to systemic nickel allergy; content depends on soil and growing conditions.',
     'qualitative'),
    ('fodmaps', 'FODMAPs (fermentable carbohydrates)',
     'Not a toxin. IBS trigger; cooking does not remove fructans, though rinsing canned legumes helps.',
     'qualitative');

CREATE TABLE antinutrient_rule (
    id             serial PRIMARY KEY,
    compound_slug  text NOT NULL REFERENCES antinutrient_compound(slug),
    -- Lower number wins when several rules match the same (food, compound).
    priority       integer NOT NULL,
    -- All patterns are case-insensitive regular expressions.
    -- NULL category_pattern means "any category".
    category_pattern text,
    name_pattern     text NOT NULL,
    -- If this matches, the rule does not apply. Used for processing that
    -- destroys the compound, e.g. canned beans have no active lectins.
    except_pattern   text,
    -- 'flagged'   : likely contains the compound (act on it)
    -- 'dismissed' : assessed and does not contain it
    -- 'unassessed': no specific rule covers this food; recorded so that the
    --               pair is visibly gap rather than silently absent
    verdict        text NOT NULL CHECK (verdict IN ('flagged', 'dismissed', 'unassessed')),
    confidence     text NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'none')),
    note           text
);

COMMIT;
