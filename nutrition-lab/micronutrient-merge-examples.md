# Nutrition Lab: three micronutrient merge examples

Ready to forward to the Nutrition Lab team. Requests were tested against `POST https://mealmaker.brotherk3d.com/api/v1/meals/generate` on 31 October 2026; all returned HTTP 200. Examples 1 and 2 were checked in a follow-up probe; Example 3 comes from the earlier recorded probe that day.

All requests contain complete macros. The nutrition numbers supplied by the client are synthetic fixtures, not actual Pumpkin nutrition. They are distinctive so that preservation is easy to verify. Genuine zeros must remain zero.

Each request includes Pumpkin, firm tofu and rolled oats, with a 600 kcal target. Current responses below show only the exact returned Pumpkin record; the meal name, other ingredients, instructions and remaining top-level properties are omitted. Expected responses show the eight micronutrients currently displayed by Meal Maker; please merge any other supported reference micronutrients as well.

Expected reference values come from the successful macros-only baseline, which matched `168448`, `Pumpkin, raw`. If NL deliberately chooses a different valid reference, return that reference's values and ID instead. Weights shown are the observed sample weights, not exact acceptance targets: generated portions may vary.

## Example 1: Supply iron; fill the remaining micronutrients

### Request

```json
{
    "ingredients": [
        {
            "name": "pumpkin",
            "caloriesPer100g": 123,
            "proteinPer100g": 7,
            "carbohydratePer100g": 17,
            "fatPer100g": 3,
            "micronutrientsPer100g": {
                "iron": 1.23
            }
        },
        {
            "name": "firm tofu"
        },
        {
            "name": "rolled oats"
        }
    ],
    "requirements": {
        "calories": 600
    }
}
```

### Current response — Pumpkin ingredient

```json
{
    "name": "pumpkin",
    "weight": 200,
    "caloriesPer100g": 123,
    "proteinPer100g": 7,
    "carbohydratePer100g": 17,
    "fatPer100g": 3,
    "sugarPer100g": 2.76,
    "saturatedFatPer100g": 0.052,
    "fiberPer100g": 0.5,
    "micronutrientsPer100g": {
        "iron": 1.23
    },
    "nutritionSource": "user"
}
```

### Expected response — Pumpkin ingredient

```json
{
    "name": "pumpkin",
    "weight": 200,
    "caloriesPer100g": 123,
    "proteinPer100g": 7,
    "carbohydratePer100g": 17,
    "fatPer100g": 3,
    "sugarPer100g": 2.76,
    "saturatedFatPer100g": 0.052,
    "fiberPer100g": 0.5,
    "micronutrientsPer100g": {
        "iron": 1.23,
        "calcium": 21,
        "magnesium": 12,
        "zinc": 0.32,
        "selenium": 0.3,
        "folate": 16,
        "vitaminC": 9,
        "vitaminB12": 0
    },
    "nutritionSource": "user",
    "usda": {
        "fdcId": 168448,
        "description": "Pumpkin, raw"
    }
}
```

The supplied micronutrients should stay unchanged. Missing keys should be filled from the reference match, and the food ID/description should remain available for thumbnails and provenance.

## Example 2: Preserve a genuine zero; fill the remaining micronutrients

### Request

```json
{
    "ingredients": [
        {
            "name": "pumpkin",
            "caloriesPer100g": 123,
            "proteinPer100g": 7,
            "carbohydratePer100g": 17,
            "fatPer100g": 3,
            "micronutrientsPer100g": {
                "vitaminC": 0
            }
        },
        {
            "name": "firm tofu"
        },
        {
            "name": "rolled oats"
        }
    ],
    "requirements": {
        "calories": 600
    }
}
```

### Current response — Pumpkin ingredient

```json
{
    "name": "pumpkin",
    "weight": 170,
    "caloriesPer100g": 123,
    "proteinPer100g": 7,
    "carbohydratePer100g": 17,
    "fatPer100g": 3,
    "sugarPer100g": 2.76,
    "saturatedFatPer100g": 0.052,
    "fiberPer100g": 0.5,
    "micronutrientsPer100g": {
        "vitaminC": 0
    },
    "nutritionSource": "user"
}
```

### Expected response — Pumpkin ingredient

```json
{
    "name": "pumpkin",
    "weight": 170,
    "caloriesPer100g": 123,
    "proteinPer100g": 7,
    "carbohydratePer100g": 17,
    "fatPer100g": 3,
    "sugarPer100g": 2.76,
    "saturatedFatPer100g": 0.052,
    "fiberPer100g": 0.5,
    "micronutrientsPer100g": {
        "iron": 0.8,
        "calcium": 21,
        "magnesium": 12,
        "zinc": 0.32,
        "selenium": 0.3,
        "folate": 16,
        "vitaminC": 0,
        "vitaminB12": 0
    },
    "nutritionSource": "user",
    "usda": {
        "fdcId": 168448,
        "description": "Pumpkin, raw"
    }
}
```

The supplied micronutrients should stay unchanged. Missing keys should be filled from the reference match, and the food ID/description should remain available for thumbnails and provenance.

## Example 3: Merge several user values with the reference data

### Request

```json
{
    "ingredients": [
        {
            "name": "pumpkin",
            "caloriesPer100g": 123,
            "proteinPer100g": 7,
            "carbohydratePer100g": 17,
            "fatPer100g": 3,
            "sugarPer100g": 0,
            "saturatedFatPer100g": 0,
            "fiberPer100g": 4.5,
            "micronutrientsPer100g": {
                "iron": 1.23,
                "calcium": 45,
                "vitaminC": 0
            }
        },
        {
            "name": "firm tofu"
        },
        {
            "name": "rolled oats"
        }
    ],
    "requirements": {
        "calories": 600
    }
}
```

### Current response — Pumpkin ingredient

```json
{
    "name": "pumpkin",
    "weight": 170,
    "caloriesPer100g": 123,
    "proteinPer100g": 7,
    "carbohydratePer100g": 17,
    "fatPer100g": 3,
    "sugarPer100g": 0,
    "saturatedFatPer100g": 0,
    "fiberPer100g": 4.5,
    "micronutrientsPer100g": {
        "iron": 1.23,
        "calcium": 45,
        "vitaminC": 0
    },
    "nutritionSource": "user"
}
```

### Expected response — Pumpkin ingredient

```json
{
    "name": "pumpkin",
    "weight": 170,
    "caloriesPer100g": 123,
    "proteinPer100g": 7,
    "carbohydratePer100g": 17,
    "fatPer100g": 3,
    "sugarPer100g": 0,
    "saturatedFatPer100g": 0,
    "fiberPer100g": 4.5,
    "micronutrientsPer100g": {
        "iron": 1.23,
        "calcium": 45,
        "magnesium": 12,
        "zinc": 0.32,
        "selenium": 0.3,
        "folate": 16,
        "vitaminC": 0,
        "vitaminB12": 0
    },
    "nutritionSource": "user",
    "usda": {
        "fdcId": 168448,
        "description": "Pumpkin, raw"
    }
}
```

The supplied micronutrients should stay unchanged. Missing keys should be filled from the reference match, and the food ID/description should remain available for thumbnails and provenance.

## Acceptance rule

Merge **per nutrient**, not per object:

- User-supplied finite, non-negative values win, including zero.
- Missing values use matched reference values when available.
- If neither source provides a value, explicitly mark it unavailable; do not invent zero.
- Apply this merge before calculating ingredient portions, and return the same nutrition used for that calculation.
- Return the reference food ID when a match exists, even when macros or micronutrients were supplied by the user.
