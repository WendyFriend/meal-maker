-- Anti-nutrient rules.
--
-- Design notes, all of which matter for correctness:
--
--  * DISMISS RULES COME FIRST. Animal tissue contains none of the plant
--    anti-nutrients, so ~2,859 foods resolve without any judgement. That is the
--    single highest-value rule in the set.
--
--  * PLANT-PART RULES BEAT SPECIES RULES. Phytate lives in bran and seeds;
--    oxalate is broadly distributed in leaves and stems.
--
--  * PROCESSING INVERTS THE ANSWER. Raw kidney beans are dangerous; canned
--    kidney beans are not. The same name produces opposite verdicts depending
--    on state, which is why except_pattern exists.
--
--  * WORD BOUNDARIES ARE LEADING-ONLY, e.g. '\mtomato'. Postgres treats \m as a
--    START boundary and \M as an END boundary, so '\mtomato\M' does NOT match
--    'Tomatoes' and silently missed 83 of 92 potato entries. Leading-only
--    boundaries match plurals, which is what USDA descriptions use.
--
--  * 'review' scope foods are included. Scope governs default display, not
--    whether a compound is present.
--
-- Idempotent: rules are cleared and reinserted.

BEGIN;

TRUNCATE antinutrient_rule RESTART IDENTITY;

-- =====================================================================
-- 1. DISMISSALS: animal tissue has none of the plant anti-nutrients
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, verdict, confidence, note)
SELECT c.slug, 100, a.cat, '.*', 'dismissed', 'high',
       'Animal tissue: contains none of the plant anti-nutrients.'
FROM antinutrient_compound c
CROSS JOIN (VALUES
    ('Beef Products'),
    ('Pork Products'),
    ('Poultry Products'),
    ('Lamb, Veal, and Game Products'),
    ('Finfish and Shellfish Products'),
    ('Sausages and Luncheon Meats')
) AS a(cat)
WHERE c.slug IN ('phytates','oxalates','tannins','lectins','protease_inhibitors',
                 'goitrogens','cyanogenic_glycosides','glycoalkaloids',
                 'saponins','coumarin');

-- Dairy and egg: no plant compounds, but egg white has avidin.
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note)
SELECT c.slug, 101, 'Dairy and Egg Products', '.*', 'egg white|egg, white', 'dismissed', 'high',
       'Dairy/egg: no plant anti-nutrients (egg white handled separately).'
FROM antinutrient_compound c
WHERE c.slug IN ('phytates','oxalates','tannins','lectins','protease_inhibitors',
                 'goitrogens','cyanogenic_glycosides','glycoalkaloids',
                 'saponins','coumarin');

-- Rendered and refined fats: compounds are removed with the seed solids.
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, verdict, confidence, note)
SELECT c.slug, 102, 'Fats and Oils', '^(oil,|fat,|lard|shortening|tallow|suet|butter oil)', 'dismissed', 'high',
       'Rendered/refined fat: plant protein is not present.'
FROM antinutrient_compound c
WHERE c.slug IN ('phytates','oxalates','tannins','lectins','protease_inhibitors',
                 'goitrogens','cyanogenic_glycosides','glycoalkaloids','saponins',
                 'nickel','salicylates','purines');

-- =====================================================================
-- 2. PHYTATES: bran, whole grains, legumes, nuts, seeds
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('phytates', 10, 'Legumes and Legume Products', '^(beans|chickpeas|lentils|peas|soybeans|cowpeas|pigeon peas|mung)', NULL,
     'flagged', 'high', 'Legume seed: phytate is the phosphorus store.'),
    ('phytates', 10, 'Nut and Seed Products', '.*', NULL, 'flagged', 'high',
     'Nut/seed kernel: phytate concentrated in the kernel.'),
    ('phytates', 10, '(Cereal Grains and Pasta)', '^(oats|wheat|barley|rye|rice|buckwheat|millet|sorghum|quinoa|maize|corn)', NULL,
     'flagged', 'high', 'Whole grain: phytate concentrated in bran and germ.'),
    -- Priority 5 so this outranks the refined-grain dismissal at 8.
    ('phytates', 5, NULL, '\m(bran|germ|whole[- ]grain|wholegrain|whole[- ]wheat)', NULL,
     'flagged', 'high', 'Bran/germ retained: milling would have removed most phytate.'),
    -- Priority 8 so refined grain outranks the generic grain rule at 10.
    ('phytates', 8, NULL, '\m(refined|white flour|white rice|polished|enriched white)', NULL,
     'dismissed', 'medium', 'Refined grain: bran/germ removed, so phytate is largely gone.'),
    ('phytates', 8, '(Cereal Grains and Pasta)', '^rice, white', NULL,
     'dismissed', 'medium', 'White rice: bran and germ milled off, so phytate is largely gone.');

-- =====================================================================
-- 3. OXALATES
-- =====================================================================
-- On sweet potato: it is often listed as high oxalate, but the commonly cited
-- oxalate tables do not rank the tuber highly, and boiling reduces it
-- substantially. Flagged MEDIUM with boiling as the mitigation. The leaves are
-- the higher-oxalate part.
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('oxalates', 5, NULL, '\m(spinach|chard|beet greens|beetroot|beets|rhubarb|amaranth|quinoa|buckwheat|sorrel|purslane)', NULL,
     'flagged', 'high', 'Amaranthaceae/Polygonaceae: notably high oxalate.'),
    -- Plural-safe leading boundary: also matches 'Potatoes'.
    ('oxalates', 8, NULL, '\m(sweet potato|taro|dasheen|eddoes|yam|cassava|potato)', NULL,
     'flagged', 'medium', 'Root/tuber: oxalate present, varies by cultivar; boiling reduces it.'),
    ('oxalates', 8, '(Nut and Seed Products)', '\m(almond|sesame|tahini|cashew|pine nut|peanut|walnut|pecan)', NULL,
     'flagged', 'medium', 'Nut/seed: almond and sesame are the notable oxalate sources.'),
    ('oxalates', 8, NULL, '\m(cocoa|chocolate)', NULL,
     'flagged', 'medium', 'Cocoa/chocolate: moderate to high oxalate per serving.'),
    ('oxalates', 8, NULL, '\m(tea, |coffee)', NULL,
     'flagged', 'low', 'Tea and coffee: oxalate present but low per brewed serving.'),
    ('oxalates', 15, 'Legumes and Legume Products', '\m(soy|tofu|tempeh)', NULL,
     'flagged', 'medium', 'Soy: moderate oxalate.'),
    ('oxalates', 15, 'Vegetables and Vegetable Products', '\m(kale|collard|mustard greens|parsley|coriander|cilantro|leek|okra)', NULL,
     'flagged', 'low', 'Leafy green: some oxalate, lower than the spinach family.'),
    ('oxalates', 15, NULL, '\m(fig|star fruit|carambola|date|raspberry|blackberry)', NULL,
     'flagged', 'low', 'Fruit with notable oxalate; star fruit is the clinical concern.'),
    ('oxalates', 10, NULL, '\m(wheat bran|rice bran|oat bran)', NULL,
     'flagged', 'medium', 'Bran: oxalate concentrates in the outer layers.'),
    ('oxalates', 30, 'Sweets', '^(sugars|honey|syrups)', NULL, 'dismissed', 'high',
     'Pure sugar/syrup: no oxalate.');

-- =====================================================================
-- 4. TANNINS
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('tannins', 5, NULL, '\m(tea, |coffee|cocoa|chocolate|red wine|wine, )', NULL,
     'flagged', 'high', 'Tannin-rich beverage: also reduces non-haem iron absorption at meals.'),
    ('tannins', 8, NULL, '\m(sorghum|millet|finger millet|ragi)', NULL,
     'flagged', 'high', 'Sorghum/millet: high condensed tannins in the outer layers.'),
    ('tannins', 10, 'Legumes and Legume Products', '\m(black bean|kidney bean|red bean|fava|broad bean|lentil)', NULL,
     'flagged', 'medium', 'Dark legumes: tannins in the seed coat.'),
    ('tannins', 10, 'Fruits and Fruit Juices', '\m(persimmon|pomegranate|grape|apple cider|berries|blueberry|cranberry)', NULL,
     'flagged', 'low', 'Tannin-containing fruit; usually not a practical concern.'),
    ('tannins', 10, NULL, '\m(walnut|chestnut|pecan|hazelnut)', NULL,
     'flagged', 'medium', 'Tannin-containing nut, especially the pellicle (skin).');

-- =====================================================================
-- 5. LECTINS: raw legumes, especially kidney beans. DESTROYED by canning.
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('lectins', 5, 'Legumes and Legume Products', '\m(kidney bean|red kidney|cannellini|white kidney)',
     '\m(canned|tinned)', 'flagged', 'high',
     'Phytohaemagglutinin: a handful of undercooked beans causes severe vomiting.'),
    ('lectins', 6, 'Legumes and Legume Products', '\m(canned|tinned)',
     NULL, 'dismissed', 'high', 'Canned legume: commercially cooked, so lectins are destroyed.'),
    ('lectins', 10, 'Legumes and Legume Products', '.*', NULL, 'flagged', 'medium',
     'Raw legume: lectins present, inactivated by thorough boiling.'),
    ('lectins', 10, '(Cereal Grains and Pasta)', '^(wheat|barley|rye|oats|rice|buckwheat)', NULL, 'flagged', 'low',
     'Raw grain: low levels, reduced by cooking.'),
    ('lectins', 12, NULL, '\m(soybean|soy bean)', NULL, 'flagged', 'medium',
     'Soy: lectins inactivated by cooking; fermented forms are lower.');

-- =====================================================================
-- 6. PROTEASE INHIBITORS
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('protease_inhibitors', 5, 'Legumes and Legume Products', '\m(soybean|soy bean|soy flour)', NULL,
     'flagged', 'high', 'Soy: among the highest trypsin inhibitor content.'),
    ('protease_inhibitors', 6, 'Legumes and Legume Products', '\m(canned|tinned)', NULL,
     'dismissed', 'high', 'Canned legume: heat treatment inactivates the inhibitors.'),
    ('protease_inhibitors', 10, 'Legumes and Legume Products', '.*', NULL,
     'flagged', 'medium', 'Legume: inhibitors inactivated by adequate moist heat.'),
    ('protease_inhibitors', 12, '(Cereal Grains and Pasta)', '.*', NULL,
     'flagged', 'low', 'Grain: low levels, inactivated by cooking.');

-- =====================================================================
-- 7. GOITROGENS
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('goitrogens', 5, 'Vegetables and Vegetable Products',
     '\m(cabbage|broccoli|cauliflower|brussels sprout|kale|turnip|rutabaga|swede|mustard greens|collard|bok choy|pak choi|watercress|radish|horseradish|kohlrabi|chinese cabbage)', NULL,
     'flagged', 'high', 'Brassicaceae: glucosinolates / progoitrin.'),
    ('goitrogens', 8, NULL, '\m(cassava|manioc|yuca)', NULL, 'flagged', 'high',
     'Cassava: goitrogenic and cyanogenic; must be properly processed.'),
    ('goitrogens', 10, NULL, '\m(millet|sorghum)', NULL, 'flagged', 'medium',
     'Millet: reported goitrogenic effect, contested.'),
    ('goitrogens', 12, NULL, '\m(soybean|soy bean|soy flour|tofu)', NULL, 'flagged', 'low',
     'Soy isoflavones: theoretical thyroid effect, only with low iodine.');

-- =====================================================================
-- 8. CYANOGENIC GLYCOSIDES
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('cyanogenic_glycosides', 5, NULL, '\m(cassava|manioc|yuca)', NULL, 'flagged', 'high',
     'Linamarin: raw cassava is a genuine poisoning risk.'),
    ('cyanogenic_glycosides', 8, NULL, '\m(bitter almond|apricot kernel)', NULL, 'flagged', 'high',
     'Amygdalin: a small number of bitter almonds can be fatal to a child.'),
    ('cyanogenic_glycosides', 10, NULL, '\m(flax|flaxseed|linseed)', NULL, 'flagged', 'medium',
     'Flaxseed: cyanogens released by crushing; ground and cooked is safest.'),
    ('cyanogenic_glycosides', 10, NULL, '\m(lima bean|butter bean)', NULL, 'flagged', 'medium',
     'Lima bean: cyanogens, reduced by thorough cooking.'),
    ('cyanogenic_glycosides', 12, NULL, '\m(bamboo shoot)', NULL, 'flagged', 'medium',
     'Bamboo shoots: cyanogenic until boiled.'),
    ('cyanogenic_glycosides', 12, NULL, '\m(sorghum)', NULL, 'flagged', 'low',
     'Sorghum: low cyanogenic potential.');

-- =====================================================================
-- 9. GLYCOALKALOIDS
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('glycoalkaloids', 5, NULL, '\m(potato)', NULL, 'flagged', 'medium',
     'Solanine: rises sharply in greened or sprouted tubers; discard those.'),
    ('glycoalkaloids', 10, NULL, '\m(eggplant|aubergine|brinjal)', NULL, 'flagged', 'low',
     'Modest solasonine content; not a concern at normal intakes.'),
    ('glycoalkaloids', 10, NULL, '\m(tomato)', NULL, 'flagged', 'low',
     'Tomato glycoalkaloids are very low in ripe fruit.');

-- =====================================================================
-- 10. SAPONINS
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('saponins', 5, NULL, '\m(quinoa)', NULL, 'flagged', 'high',
     'Saponins in the seed coat: rinse before cooking to remove bitterness.'),
    ('saponins', 10, 'Legumes and Legume Products', '.*', NULL, 'flagged', 'low',
     'Legumes contain saponins; mostly benign and largely heat-stable.'),
    ('saponins', 12, NULL, '\m(oats|oat bran)', NULL, 'flagged', 'low',
     'Oats: low saponin content.');

-- =====================================================================
-- 11. AVIDIN: raw egg white only
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('avidin', 5, NULL, '\m(egg,?\s*white|egg white)', NULL, 'flagged', 'high',
     'Avidin binds biotin, but is destroyed by cooking.'),
    ('avidin', 6, NULL, '\m(egg)', NULL, 'dismissed', 'medium',
     'Whole egg: avidin confined to the white and denatured by heat.');

-- =====================================================================
-- 12. PURINES
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('purines', 5, NULL, '\m(liver|kidney, |sweetbread|brain|heart|gizzard|pate)', NULL,
     'flagged', 'high', 'Organ meat: highest purine density.'),
    ('purines', 8, NULL, '\m(anchovy|sardine|mackerel|herring|mussel|scallop|shrimp|prawn|trout|tuna|salmon)', NULL,
     'flagged', 'medium', 'Oily fish and shellfish: moderate-to-high purines.'),
    ('purines', 10, NULL, '\m(yeast extract|marmite|vegemite|brewer)', NULL,
     'flagged', 'high', 'Yeast extract: very high purine content.'),
    ('purines', 12, NULL, '\m(beer|ale|lager|stout)', NULL, 'flagged', 'medium',
     'Beer: purines plus alcohol, which reduces uric acid excretion.'),
    ('purines', 4, 'Fats and Oils', '^(oil,|fat,|lard|tallow|shortening)', NULL, 'dismissed', 'high',
     'Purines are water-soluble and are removed by rendering.'),
    ('purines', 6, NULL, '\m(beef|pork|poultry|chicken|turkey|lamb|veal|game|finfish|shellfish|dairy)', NULL,
     'dismissed', 'medium', 'Non-organ animal tissue: low purine relative to organ meat.');

-- =====================================================================
-- 13. HISTAMINE / TYRAMINE
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('histamine', 5, NULL, '\m(aged cheese|parmesan|cheddar|gouda|blue cheese|brie|camembert|emmenthal|swiss cheese)', NULL,
     'flagged', 'medium', 'Ageing raises histamine/tyramine; content varies widely by batch.'),
    ('histamine', 8, NULL, '\m(salami|prosciutto|cured|sauerkraut|kimchi|miso|pastrami)', NULL,
     'flagged', 'medium', 'Cured/fermented: microbial decarboxylation produces amines.'),
    ('histamine', 10, NULL, '\m(red wine|wine, red)', NULL, 'flagged', 'low',
     'Red wine: sulphites and amines; sensitivity varies.');

-- =====================================================================
-- 14. SALICYLATES
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('salicylates', 5, 'Spices and Herbs', '.*', NULL, 'flagged', 'medium',
     'Dried herbs and spices are among the most salicylate-dense foods by weight.'),
    ('salicylates', 10, NULL, '\m(berry|berries|raspberry|blackberry|strawberry|blueberry|grape|orange|lemon|lime|fig|date|honey|tea, |coffee)', NULL,
     'flagged', 'low', 'Salicylate-containing plant food; only relevant to sensitivity.');

-- =====================================================================
-- 15. SULFITES
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('sulfites', 5, NULL, '\m(dried|dehydrated|sulfured)', NULL, 'flagged', 'medium',
     'Dried fruit: sulphites are commonly added as a preservative.'),
    ('sulfites', 8, NULL, '\m(wine)', NULL, 'flagged', 'medium',
     'Wine: sulphites are a standard additive.'),
    ('sulfites', 10, NULL, '\m(potato, dehydrated|potatoes, dehydrated)', NULL, 'flagged', 'low',
     'Dehydrated potato: sulphites often added to prevent browning.');

-- =====================================================================
-- 16. COUMARIN: cassia cinnamon
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('coumarin', 5, NULL, '\m(cassia|saigon cinnamon)', NULL, 'flagged', 'high',
     'Cassia cinnamon has far more coumarin than Ceylon; use Ceylon for regular use.'),
    ('coumarin', 8, NULL, '\m(cinnamon)', 'ceylon', 'flagged', 'low',
     'Likely cassia unless stated Ceylon. Ceylon is low; cassia is not.'),
    ('coumarin', 9, NULL, '\m(ceylon cinnamon|cinnamon, ceylon)', NULL, 'dismissed', 'high',
     'Ceylon cinnamon: coumarin content is negligible.');

-- =====================================================================
-- 17. NICKEL
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('nickel', 5, 'Legumes and Legume Products', '.*', NULL, 'flagged', 'medium',
     'Legumes are among the strongest nickel accumulators.'),
    ('nickel', 8, NULL, '\m(cocoa|chocolate|nuts, |almond|hazelnut|soy|oats)', NULL, 'flagged', 'medium',
     'Nickel accumulator: content depends on soil.');

-- =====================================================================
-- 18. FODMAPs
-- =====================================================================
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, except_pattern, verdict, confidence, note) VALUES
    ('fodmaps', 5, NULL, '\m(onion|garlic|leek|shallot|scallion)', NULL, 'flagged', 'high',
     'Fructans: not removed by cooking.'),
    ('fodmaps', 8, 'Legumes and Legume Products', '.*', NULL, 'flagged', 'medium',
     'GOS: rinsing canned legumes reduces but does not remove them.'),
    ('fodmaps', 10, NULL, '\m(apple|pear|mango|cherry|peach|plum|watermelon|apricot)', NULL,
     'flagged', 'medium', 'Excess fructose / polyols.'),
    ('fodmaps', 12, NULL, '\m(cauliflower|mushroom|asparagus|artichoke|sweet potato)', NULL,
     'flagged', 'low', 'Mannitol / fructans; portion-dependent.');

-- =====================================================================
-- 19. CATEGORY BASELINES: no plant food may end up with zero rows
-- =====================================================================
-- Every specific rule above is name-based, so a plant food with an unlisted
-- name (e.g. 'Parsnips, cooked', 'Ginger root, raw') matched nothing and
-- silently produced no row, which is indistinguishable from "checked and
-- clear". These are recorded as 'unassessed', NOT 'flagged': flagging every
-- plant food for every compound produced 48,010 flags and drowned the real
-- findings.
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, verdict, confidence, note)
SELECT c.slug, 900, p.cat, '.*', 'unassessed', 'none',
       'Plant tissue: no specific rule matched, so this is an explicit gap rather than a finding.'
FROM antinutrient_compound c
CROSS JOIN (VALUES
    ('Vegetables and Vegetable Products'),
    ('Fruits and Fruit Juices'),
    ('Legumes and Legume Products'),
    ('Cereal Grains and Pasta'),
    ('Nut and Seed Products'),
    ('Spices and Herbs'),
    ('Baked Products'),
    ('Beverages'),
    ('Breakfast Cereals'),
    ('Soups, Sauces, and Gravies'),
    ('American Indian/Alaska Native Foods'),
    ('Sweets'),
    ('Snacks'),
    ('Baby Foods'),
    ('Fast Foods'),
    ('Restaurant Foods'),
    ('Meals, Entrees, and Side Dishes')
) AS p(cat)
WHERE c.slug IN ('phytates','oxalates','tannins','lectins','protease_inhibitors',
                 'saponins','goitrogens','salicylates','fodmaps','nickel');

INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, verdict, confidence, note)
SELECT c.slug, 900, a.cat, '.*', 'dismissed', 'medium',
       'Animal product: no plant anti-nutrient.'
FROM antinutrient_compound c
CROSS JOIN (VALUES
    ('Beef Products'),
    ('Pork Products'),
    ('Poultry Products'),
    ('Lamb, Veal, and Game Products'),
    ('Finfish and Shellfish Products'),
    ('Dairy and Egg Products'),
    ('Sausages and Luncheon Meats')
) AS a(cat)
WHERE c.slug IN ('phytates','oxalates','tannins','lectins','protease_inhibitors',
                 'saponins','goitrogens','cyanogenic_glycosides','glycoalkaloids',
                 'coumarin','salicylates','fodmaps','nickel');

-- =====================================================================
-- 20. EMULSION PRODUCTS IN Fats and Oils
-- =====================================================================
-- Dressings and spreads are emulsions, not rendered fat, so the rendering
-- dismissal does not cover them. Without this they had no rows at all.
INSERT INTO antinutrient_rule (compound_slug, priority, category_pattern, name_pattern, verdict, confidence, note)
SELECT c.slug, 900, 'Fats and Oils', '.*', 'unassessed', 'none',
       'Emulsion/spread product: no specific rule matched.'
FROM antinutrient_compound c
WHERE c.slug IN ('phytates','oxalates','tannins','lectins','protease_inhibitors',
                 'saponins','goitrogens','cyanogenic_glycosides','glycoalkaloids',
                 'coumarin','salicylates','fodmaps','nickel','purines');

COMMIT;
