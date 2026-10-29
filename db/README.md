# Nutrition database

Local PostgreSQL 18 database (`nutrition`) built from USDA FoodData Central
**SR Legacy** (April 2018). No API calls at runtime — the data is local.

## Why SR Legacy and not Foundation

Measured from the downloaded archives:

| | Foundation (2026-04) | SR Legacy (2018-04) |
|---|---|---|
| `food.csv` rows | 87,991 | **7,793** |
| Real foods | **395** in `foundation_food.csv` | 7,793 |
| Lab sub-samples with 1 nutrient each | 75,055 | 0 |
| Foods with ≥20 nutrients | 1,100 | **7,569 (97%)** |
| Median nutrients per food | 1 | **85** |
| Numeric amount coverage | 100% | 100% |
| Nutrients reported for <1% of foods | 148 of 477 | **1 of 474** |

Foundation is a research archive of individual laboratory measurements, not a
food composition table. Only ~1,100 of its rows are usable as foods. SR Legacy
is the consumer-facing one. Foundation's CSVs are still in `data/usda/` in case
the lab provenance becomes useful later.

SR Legacy is **frozen** — USDA state it is the final release and will never be
updated. Fine for whole foods, which don't change.

## Files

| File | Purpose |
|---|---|
| `001_staging.sql` | Text-only tables mirroring the CSV headers exactly |
| `002_schema.sql` | Typed tables (idempotent; drops and rebuilds) |
| `003_transform.sql` | Moves staging → typed, applies scope rules |
| `004_view.sql` | `v_food_core`: the 12 nutrients the app uses, pivoted wide |
| `005_verify.sql` | Integrity assertions (row counts, silent-loss checks) |
| `006_investigate.sql` | Anomaly queries (duplicate nutrients, unit checks) |
| `007_search.sql` | `pg_trgm` indexes + `search_food()` |
| `008_synonyms.sql` | `food_synonym` table + `search_food_with_synonyms()` |
| `009_smoke.sql` | End-to-end smoke test |
| `load-sr-legacy.ps1` | Full load: runs 001–004 |
| `verify.ps1` | Runs 005 |

## Usage

```powershell
# full load (idempotent, safe to re-run)
powershell -NoProfile -ExecutionPolicy Bypass -File db\load-sr-legacy.ps1

# verification
powershell -NoProfile -ExecutionPolicy Bypass -File db\verify.ps1

# data explorer UI -> http://localhost:5199
node --env-file=.env db\ui\server.mjs
```

Credentials come from `NUTRITION_DATABASE_URL` in `.env`, passed to `psql` via
`PGPASSWORD` so the password never appears on a command line.

## Data explorer

`db/ui/` is a standalone read-only UI: search, full nutrient panels, per-portion
calorie maths, and anti-nutrient flags per food, plus charts of scope split,
calorie distribution and flag counts per compound.

It is deliberately separate from the React app so the production app keeps using
`/api/nutrition` and `supabase/migrations` is untouched. No npm dependencies: it
runs queries through the installed `psql` binary, so nothing was added to
`package.json`.

Port 5199 was chosen to avoid the project's own 3010 (app, HTTPS) and 3020 (API)
(and 5173/3001 used by other local projects).

One gotcha worth remembering: `psql -c` does **not** substitute `:'var'`
variables - that only works for `-f` / stdin input. The server therefore pipes
SQL over stdin, which also means user input is quoted by psql rather than
concatenated into SQL.

## Schema

```
food_category(id, description)
nutrient(nutrient_nbr, name, unit)          -- nutrient_nbr is stable across FDC datasets
food(fdc_id, description, food_category_id, data_type, scope)
food_nutrient(fdc_id, nutrient_nbr, amount) -- long format
food_portion(portion_id, fdc_id, seq_num, amount, description, gram_weight)
food_synonym(id, fdc_id, term, origin, weight)
```

Long format is deliberate: 474 nutrients with a median of 85 populated per food
cannot be sensibly represented as columns.

### Two traps avoided

**Energy appears twice, in different units.** `208` is kcal, `268` is kJ — the
ratio 268/208 is exactly 4.184. `v_food_core.kcal` reads `208` only. Summing
both would inflate every calorie figure by 5.184×.

**Missing ≠ zero.** Rows with a blank amount are skipped rather than written as
0, because "not measured" is not the same as "measured zero". This matches how
the existing `getMicronutrients()` in `server/nutrition/usda/mapper.ts` behaves.

## Scope

`food.scope` classifies rather than deletes, so the decision is reversible with
one UPDATE instead of a re-import.

| scope | count | rule |
|---|---|---|
| `core` | 4,915 | whole-food categories + generic sausages/luncheon meats |
| `excluded` | 1,381 | Sweets, Baby Foods, Fast Foods, Snacks, Restaurant, Meals/Entrees |
| `review` | 1,497 | Baked Products, Beverages, Breakfast Cereals, Soups/Sauces/Gravies, Am. Indian |

`Soups, Sauces, and Gravies` is `review` rather than `excluded` because it
contains `Sauce, pasta, spaghetti/marinara, ready-to-serve` alongside branded
gravies — it needs name-level splitting, not a category rule.

## Search

`search_food(q, max_rows)` returns foods with a score, blending:

- 0.45 head-noun match (query is the leading word)
- 0.30 trigram similarity
- 0.15 exact leading-comma-part match
- −0.20 product-word penalty (`powder`, `dried`, `soup`, `crackers`, …)
- −0.05 length normalisation

## Known limitations (measured, not guessed)

These are why a model layer is still needed on top:

| Query | Current top result | Should be |
|---|---|---|
| `chicken breast` | `Chicken breast, roll, oven-roasted` | `Chicken, broilers or fryers, breast, meat only, raw` |
| `olive oil` | `Mayonnaise, reduced fat, with olive oil` | `Oil, olive, salad or cooking` |
| `wholemeal bread` | `Bread, oatmeal` | `Bread, whole-wheat, commercially prepared` |
| `rolled oats` | *(no match)* | `Cereal Grains and Pasta` entry |
| `bread` | `Bread, egg` | `Bread, white, commercial` |

Two distinct causes:

1. **Retrieval** — the canonical entry may not be in the candidate set at all
   (`rolled oats` matches nothing).
2. **Ties** — USDA scores every `Bread, <variant>` identically, so ordering is
   arbitrary. No scoring function can break a genuine tie.

`food_synonym` exists to address both: synonyms widen retrieval, and a curated
or LLM-generated mapping resolves the ambiguous staples. It is **empty for now**
by design — the enrichment pass is a separate, reviewable step.

## Not yet done

- Deduplication of near-identical entries (e.g. ~18 `Potatoes, french fried` rows)
- LLM synonym generation
- Wiring the app to this database instead of `/api/nutrition`

## Anti-nutrient flagging

Rule-based, no LLM involved. USDA defines oxalic acid (245), phytic acid (246),
raffinose (288) and stachyose (289) but populates **zero rows** for all of them,
and lectins/tannins/saponins/goitrogens are not in the dictionary at all. So
there is nothing to query: every (food, compound) pair must be derived from what
the food *is*.

| File | Purpose |
|---|---|
| `010_antinutrients.sql` | `antinutrient_compound` + `antinutrient_rule` |
| `011_antinutrient_rules.sql` | ~150 rules |
| `012_apply_antinutrients.sql` | Applies rules → `antinutrient_flag` |
| `013_antinutrient_report.sql` | Counts per compound |
| `014_diagnose_flags.sql` | False-positive queries |
| `015_gaps.sql` | Coverage gap queries |
| `016_accuracy_check.sql` | 16 high-stakes assertions |

### Three verdicts, not two

```
flagged     4,845   likely contains the compound; act on it
dismissed  40,855   assessed and does not contain it
unassessed 43,165   no specific rule covers it — an explicit gap
```

`unassessed` exists because the alternative was worse. A blanket "all plant
tissue is flagged" produced **48,010 flagged rows**, which drowns the 4,845 real
findings in noise. A missing row silently looks like "checked and clear", which
is the one outcome an audit trail must never allow. So the gap is recorded,
queryable, and is what a review queue should consume.

### Rule precedence

Lower `priority` number wins per (food, compound). This is what makes
`canned kidney beans → lectins dismissed` beat `legume → lectins flagged`.
Specific rules sit at 4–15, category baselines at 900.

### Verified behaviour

All 16 assertions in `016_accuracy_check.sql` pass:

| Case | Result |
|---|---|
| Cassava, raw → cyanogens | flagged, high |
| Kidney bean **raw** → lectins | flagged |
| Kidney bean **canned** → lectins | dismissed, high |
| Spinach / rhubarb raw → oxalates | flagged, high |
| Broccoli → goitrogens | flagged, high |
| Quinoa uncooked → saponins | flagged, high |
| Liver → purines / Lard → purines | flagged / dismissed |
| Egg white raw → avidin / whole egg | flagged / dismissed |
| **White rice** vs **brown rice** → phytates | dismissed / flagged |
| Beef → oxalates | dismissed, high |
| Onions → FODMAPs | flagged, high |
| Cheddar → histamine | flagged |

### Known limitations

- **Name-based, so it misses unnamed foods.** A plant food with an unlisted name
  lands in `unassessed`, not `flagged`. That is honest but incomplete.
- **No quantities.** Everything is categorical. A sourced numeric layer
  (oxalate, phytate, proanthocyanidin tables) can join to `fdc_id` later without
  schema change.
- **Scope is not consulted.** `excluded` foods (sweets, fast food, baby food)
  are still flagged, since scope governs default display, not whether a compound
  is present.
- **Dairy/egg still accrues plant-compound flags** via specific rules matching
  words like `chocolate`, `berry` or `cocoa` in the product name. These are
  arguably correct (chocolate milk does contain oxalate from the cocoa) but
  should be reviewed.
- **Purines flag 215 foods**, mostly organ meat and oily fish. Non-organ meat is
  dismissed at medium confidence, which is a simplification.
