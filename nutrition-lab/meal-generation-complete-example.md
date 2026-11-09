# Complete meal-generation request and response example

Endpoint: `POST https://mealmaker.brotherk3d.com/api/v1/meals/generate`

This example uses the actual HTTP 200 response recorded on 31 October 2026 for `complete-macros-iron-only`. Authentication is omitted; send your own bearer key from a trusted server.

- **Request:** complete synthetic Pumpkin macros plus user iron; names only for the other two ingredients.
- **Current response:** the full, unmodified API response, including all ingredients, instructions and metadata.
- **Expected response:** a proposed example preserving the current portions, recipe text and all supplied values. Pumpkin's missing micronutrients and food ID are added from the successful reference lookup. Missing micronutrient keys on the other records are shown as `null`, not fabricated zeros. NL should fill those keys with reliable reference values if available; otherwise explicitly return them unavailable. These nulls are proposed availability placeholders, not measured nutrient values.

All nutrition is per 100 g; ingredient weights are grams. Test macros are synthetic and do not describe real Pumpkin. The expected Pumpkin reference values come from food ID 168448, Pumpkin, raw. Generated portions and instructions may vary; the key requirements are preservation of user values, reference enrichment, and explicit handling of unavailable data.

## Complete request

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

## Complete current response

```json
{
    "mealName": "Savory Pumpkin and Tofu Oat Bowl",
    "ingredients": [
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
        },
        {
            "name": "firm tofu",
            "weight": 100,
            "caloriesPer100g": 80,
            "proteinPer100g": 9.08,
            "carbohydratePer100g": 1.52,
            "fatPer100g": 4.2,
            "sugarPer100g": 0.4,
            "saturatedFatPer100g": 0.5,
            "fiberPer100g": 0.6,
            "micronutrientsPer100g": {
                "fiber": 0.6,
                "sugar": 0.4,
                "saturatedFat": 0.5,
                "monounsaturatedFat": 1.2,
                "polyunsaturatedFat": 2.5,
                "transFat": 0,
                "cholesterol": 0,
                "sodium": 23,
                "calcium": 180,
                "iron": 1.3
            },
            "usda": {
                "fdcId": 175236,
                "description": "Vitasoy USA Azumaya, Firm Tofu"
            },
            "nutritionSource": "usda"
        },
        {
            "name": "rolled oats",
            "weight": 70,
            "caloriesPer100g": 389,
            "proteinPer100g": 16.9,
            "carbohydratePer100g": 66.3,
            "fatPer100g": 6.9,
            "fiberPer100g": 10.6,
            "nutritionSource": "estimated"
        }
    ],
    "instructions": [
        "Peel and cube the pumpkin into small, even pieces.",
        "Place the pumpkin in a pot with water and boil until tender, then drain the water.",
        "Rinse the rolled oats under cold water to remove excess starch.",
        "Combine the rinsed oats with water in a small pot and simmer over medium heat until the water is absorbed and oats are soft.",
        "Press the firm tofu to remove excess moisture, then cut into small cubes.",
        "Pan-sear the tofu cubes in a non-stick pan over medium heat until golden brown on all sides.",
        "Combine the cooked pumpkin, cooked oats, and seared tofu in a bowl.",
        "Season to taste and serve warm."
    ],
    "servings": 1,
    "estimatedIngredients": ["rolled oats"],
    "considerations": [
        {
            "id": "whole-grains",
            "title": "Soak or ferment whole grains",
            "severity": "tip",
            "compounds": ["phytates"],
            "summary": "Phytates in whole grains bind iron, zinc and calcium. Soaking, sprouting or fermenting (sourdough) breaks them down.",
            "steps": [
                "Soak oats overnight (overnight oats) or grains for 8–12 hours before cooking.",
                "Prefer sourdough or sprouted-grain breads."
            ],
            "ingredients": ["rolled oats"]
        }
    ]
}
```

## Complete expected response

```json
{
    "mealName": "Savory Pumpkin and Tofu Oat Bowl",
    "ingredients": [
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
                "fiber": 0.5,
                "sugar": 2.76,
                "saturatedFat": 0.052,
                "monounsaturatedFat": 0.013,
                "polyunsaturatedFat": 0.005,
                "transFat": 0,
                "cholesterol": 0,
                "sodium": 1,
                "potassium": 340,
                "calcium": 21,
                "iron": 1.23,
                "magnesium": 12,
                "phosphorus": 44,
                "zinc": 0.32,
                "selenium": 0.3,
                "vitaminA": 426,
                "vitaminC": 9,
                "vitaminD": 0,
                "vitaminE": 1.06,
                "vitaminK": 1.1,
                "thiamin": 0.05,
                "riboflavin": 0.11,
                "niacin": 0.6,
                "vitaminB6": 0.061,
                "folate": 16,
                "vitaminB12": 0,
                "choline": 8.2
            },
            "nutritionSource": "user",
            "usda": {
                "fdcId": 168448,
                "description": "Pumpkin, raw"
            }
        },
        {
            "name": "firm tofu",
            "weight": 100,
            "caloriesPer100g": 80,
            "proteinPer100g": 9.08,
            "carbohydratePer100g": 1.52,
            "fatPer100g": 4.2,
            "sugarPer100g": 0.4,
            "saturatedFatPer100g": 0.5,
            "fiberPer100g": 0.6,
            "micronutrientsPer100g": {
                "fiber": 0.6,
                "sugar": 0.4,
                "saturatedFat": 0.5,
                "monounsaturatedFat": 1.2,
                "polyunsaturatedFat": 2.5,
                "transFat": 0,
                "cholesterol": 0,
                "sodium": 23,
                "calcium": 180,
                "iron": 1.3,
                "magnesium": null,
                "zinc": null,
                "selenium": null,
                "folate": null,
                "vitaminC": null,
                "vitaminB12": null
            },
            "usda": {
                "fdcId": 175236,
                "description": "Vitasoy USA Azumaya, Firm Tofu"
            },
            "nutritionSource": "usda"
        },
        {
            "name": "rolled oats",
            "weight": 70,
            "caloriesPer100g": 389,
            "proteinPer100g": 16.9,
            "carbohydratePer100g": 66.3,
            "fatPer100g": 6.9,
            "fiberPer100g": 10.6,
            "nutritionSource": "estimated",
            "micronutrientsPer100g": {
                "iron": null,
                "calcium": null,
                "magnesium": null,
                "zinc": null,
                "selenium": null,
                "folate": null,
                "vitaminC": null,
                "vitaminB12": null
            }
        }
    ],
    "instructions": [
        "Peel and cube the pumpkin into small, even pieces.",
        "Place the pumpkin in a pot with water and boil until tender, then drain the water.",
        "Rinse the rolled oats under cold water to remove excess starch.",
        "Combine the rinsed oats with water in a small pot and simmer over medium heat until the water is absorbed and oats are soft.",
        "Press the firm tofu to remove excess moisture, then cut into small cubes.",
        "Pan-sear the tofu cubes in a non-stick pan over medium heat until golden brown on all sides.",
        "Combine the cooked pumpkin, cooked oats, and seared tofu in a bowl.",
        "Season to taste and serve warm."
    ],
    "servings": 1,
    "estimatedIngredients": ["rolled oats"],
    "considerations": [
        {
            "id": "whole-grains",
            "title": "Soak or ferment whole grains",
            "severity": "tip",
            "compounds": ["phytates"],
            "summary": "Phytates in whole grains bind iron, zinc and calcium. Soaking, sprouting or fermenting (sourdough) breaks them down.",
            "steps": [
                "Soak oats overnight (overnight oats) or grains for 8–12 hours before cooking.",
                "Prefer sourdough or sprouted-grain breads."
            ],
            "ingredients": ["rolled oats"]
        }
    ]
}
```
