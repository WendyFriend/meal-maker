-- Applies antinutrient_rule to every food, producing antinutrient_flag.
--
-- Rule precedence within one (food, compound): the lowest priority NUMBER wins,
-- so specific rules (priority 5) override general dismissals (priority 100).
-- This is what makes "canned kidney beans is dismissed" beat "legume is
-- flagged".
--
-- Every (food, compound) pair ends in exactly one row - flagged or dismissed -
-- so the table doubles as the audit trail and re-running changes nothing.

BEGIN;

DROP TABLE IF EXISTS antinutrient_flag;

CREATE TABLE antinutrient_flag (
    fdc_id        integer NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
    compound_slug text    NOT NULL REFERENCES antinutrient_compound(slug),
    verdict       text    NOT NULL CHECK (verdict IN ('flagged', 'dismissed', 'unassessed')),
    confidence    text    NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'none')),
    rule_id       integer,
    note          text,
    -- 'rule' for now; becomes 'llm' or 'human' when those passes run.
    decided_by    text    NOT NULL DEFAULT 'rule',
    decided_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fdc_id, compound_slug)
);

INSERT INTO antinutrient_flag (fdc_id, compound_slug, verdict, confidence, rule_id, note)
SELECT DISTINCT ON (f.fdc_id, r.compound_slug)
    f.fdc_id,
    r.compound_slug,
    r.verdict,
    r.confidence,
    r.id,
    r.note
FROM food f
JOIN food_category fc ON fc.id = f.food_category_id
JOIN antinutrient_rule r
  ON (r.category_pattern IS NULL OR fc.description ~* r.category_pattern)
 AND f.description ~* r.name_pattern
 AND (r.except_pattern IS NULL OR f.description !~* r.except_pattern)
-- Ties on priority are broken deterministically so reruns are stable.
ORDER BY f.fdc_id, r.compound_slug, r.priority, r.id;

CREATE INDEX antinutrient_flag_compound_idx ON antinutrient_flag (compound_slug, verdict);
CREATE INDEX antinutrient_flag_food_idx ON antinutrient_flag (fdc_id);

COMMIT;
