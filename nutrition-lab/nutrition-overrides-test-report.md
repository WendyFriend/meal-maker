# Nutrition Lab: user nutrition overrides

Tested 31 October 2026 against `https://mealmaker.brotherk3d.com/api/v1/meals/generate`.
Live guide version: `4176c6af5fd7`. Six generation requests, all HTTP 200.
All supplied nutrition values were synthetic test fixtures, not real Pumpkin nutrition or private user records.
No application code was changed as part of this probe.

**Subsequent integration update:** the app now forwards macro fields directly to NL. References below to the app's nested `match` payload describe the implementation at test time. **31 October fix verified:** guide `e83dd6bb6d7e` now merges partial micronutrients. A live Pumpkin request preserved synthetic macros (123 kcal, 7 g protein, 17 g carbs, 3 g fat), iron 1.23 and vitamin C 0; it filled calcium 21 and magnesium 12 and returned food ID 168448. The app now forwards sparse micronutrient overrides as well. The results below document behavior before this fix.

The exact requests and responses are in [nutrition-overrides-test-results.json](nutrition-overrides-test-results.json). Authentication credentials are excluded.

## Findings

| Request shape                                                                           | Observed behavior                                                                                                                        |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Ingredient name only                                                                    | Returned reference Pumpkin nutrition: 26 kcal, 1 g protein, 6.5 g carbohydrate, 0.1 g fat per 100 g, micronutrients, and food ID 168448. |
| Complete macros directly on the ingredient, no food ID or micronutrient block           | Preserved supplied macros; filled sugar, saturated fat, fiber, micronutrients and food ID from reference data.                           |
| Complete macros plus a partial `micronutrientsPer100g` block directly on the ingredient | Preserved macros, optional fields, supplied micronutrients and zeros. Missing micronutrients and the food ID were not filled in.         |
| Partial macros directly on the ingredient                                               | Ignored the supplied protein, sugar and iron; returned reference values instead.                                                         |
| Nutrition nested in `ingredient.match`, without a food ID                               | Ignored the nested overrides.                                                                                                            |
| Nutrition nested in `ingredient.match`, with a valid food ID                            | Also ignored the nested overrides. This is the shape currently sent by the app.                                                          |

The complete-macros test supplied 123 kcal, 7 g protein, 17 g carbohydrate and 3 g fat per 100 g. NL returned those exact values, chose 170 g Pumpkin, and returned a meal totaling 600.3 kcal against a 600 kcal target. This is consistent with portion sizing using the supplied nutrition; a single generated meal does not establish deterministic portions or a general accuracy bound.

Generation round trips for these samples ranged from 1.6 to 2.7 seconds. The requests used Pumpkin, firm tofu and rolled oats, with a 600 kcal goal. These timings are observations, not a latency guarantee.

## Payload that already works for saved Pumpkin with macros only

Send the values directly on the ingredient, without requiring a food ID or nesting them in `match`:

```json
{
    "ingredients": [
        {
            "name": "pumpkin",
            "caloriesPer100g": 123,
            "proteinPer100g": 7,
            "carbohydratePer100g": 17,
            "fatPer100g": 3
        },
        { "name": "firm tofu" },
        { "name": "rolled oats" }
    ],
    "requirements": { "calories": 600 }
}
```

The returned Pumpkin record included the supplied macros, reference micronutrients, `nutritionSource: "user"`, and `usda.fdcId: 168448`. The food ID can be used for the existing thumbnail endpoint.

Our integration now uses this supported format for user macros and no longer relies on the nested `match` payload to communicate overrides. Applying saved macros only after NL has chosen portions can otherwise change the displayed meal energy.

## Ready-to-send change request

**Title: Merge partial user nutrition with reference data before meal portion sizing**

Meal Maker users can save ingredient nutrition without a USDA food ID. Please support any subset of nutrition fields directly on each ingredient in `POST /api/v1/meals/generate`.

### Requested behavior

1. Preserve every valid supplied value independently, including zero. Support macros, sugar, saturated fat, fiber and supported `micronutrientsPer100g` keys.
2. Resolve the food by name or an optional known food ID and fill only missing fields from reference data. Supplying a partial micronutrient object should not suppress enrichment of its other fields.
3. Choose portions using this final merged nutrition. Return the same nutrition values used for those calculations.
4. Return the food ID/description when a reference match exists, including when user macros were supplied. This supports images and explains the reference data used.
5. If no reference match exists, retain valid user nutrition and explicitly identify unavailable values. Do not replace unavailable values with zero or invent missing micronutrients.
6. Document the supported payload and precedence. Reject invalid values or unsupported override shapes with a clear validation error rather than silently ignoring them.
7. Prefer per-field provenance (`user`, `reference`, `unavailable`) where practical: the current single `nutritionSource` cannot fully describe a record containing both user and reference values.

### Reproduction: partial macros ignored

With the same other ingredients and calorie goal as the working request above, send:

```json
{
    "name": "pumpkin",
    "proteinPer100g": 7,
    "sugarPer100g": 0,
    "micronutrientsPer100g": { "iron": 1.23 }
}
```

Observed: protein 1 g, sugar 2.76 g and iron 0.8 mg per 100 g, rather than the supplied values. Expected: retain 7 g protein, zero sugar and 1.23 mg iron; fill the remaining fields from the reference match.

### Reproduction: partial micronutrients prevent enrichment

Send the complete synthetic macros from the working request, plus:

```json
{
    "sugarPer100g": 0,
    "saturatedFatPer100g": 0,
    "fiberPer100g": 4.5,
    "micronutrientsPer100g": {
        "iron": 1.23,
        "calcium": 45,
        "vitaminC": 0
    }
}
```

Observed: supplied values are preserved, but only those three micronutrients are returned and no `usda` food ID is present. Expected: preserve the three overrides, fill missing micronutrients such as magnesium and zinc, and retain food ID 168448 when that remains the reference match.

### Acceptance checks

- Complete user macros without a food ID continue to work and are used for portion sizing.
- A single supplied macro or micronutrient is preserved while missing fields are enriched.
- Explicit zero is preserved for every supported field.
- Partial micronutrient blocks merge by key instead of replacing the reference block.
- Unknown custom foods retain supplied data and explicitly mark missing data unavailable.
- Returned nutrition and portions reproduce the energy used by the generation calculation, allowing documented portion-rounding tolerance.
- Supplied records do not require fabricated USDA IDs or descriptions.
- Unsupported request shapes produce actionable errors or are explicitly documented as unsupported.
