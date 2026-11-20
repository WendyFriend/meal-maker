# MealMaker API: nutrition labels and food photos

Base URL: `https://mealmaker.brotherk3d.com/api/v1`
Auth: `Authorization: Bearer <key>` on every request.
Scope: these endpoints need the **`labels`** scope on the key (otherwise `403 SCOPE_REQUIRED`).
Full API guide (always current): `GET /docs` with the same key.

## Sending a photo

All three endpoints take the photo either way:

- **Raw body**: the image bytes, `Content-Type: image/jpeg` (or png / webp / gif).
- **JSON**: `{"image": "data:image/jpeg;base64,..."}` with `Content-Type: application/json` (what a browser camera gives you).

Max 8 MB. Shrink phone photos to about 1600 px on the long side first: faster, and just as accurate.

## 1. Nutrition label -> nutrition data

`POST /labels/read` (2-10 s)

Optional query: `?ingredient=1&name=<food name>` also returns the label as one ingredient, per 100 g, in the same field names `/meals/generate` uses.

Response:

```ts
{
  labelFound: boolean;            // false: no nutrition panel in the photo
  servingSize: string | null;     // as printed, e.g. "30 g"
  servingsPerPackage: number | null;
  perServing: Record<Nutrient, Amount | null>;
  per100:     Record<Nutrient, Amount | null>;   // per 100 g or 100 mL
  other: { name: string; perServing: Amount | null; per100: Amount | null }[]; // extra rows: iron, vitamins, added sugars...
  warnings: string[];             // e.g. numbers that don't add up; show them to the user
  model: string;
  // only with ?ingredient=1:
  ingredient?: { name, caloriesPer100g, proteinPer100g, carbohydratePer100g, fatPer100g,
                 sugarPer100g, saturatedFatPer100g, fiberPer100g, calciumPer100g, ironPer100g, ... };
  basis?: '100g' | '100mL' | null;
}

type Nutrient = 'energyKj' | 'calories' | 'protein' | 'gluten' | 'fatTotal' | 'saturated' | 'trans'
  | 'polyunsaturated' | 'monounsaturated' | 'cholesterol' | 'carbohydrate' | 'sugars' | 'lactose'
  | 'galactose' | 'fibre' | 'sodium' | 'calcium';

type Amount = {
  text: string;          // the cell as printed, e.g. "<1 g"
  value: number | null;  // the number; "Nil detected" is 0
  unit: string | null;   // "g", "mg", "kJ", "kcal"...
  lessThan: boolean;     // true for "<1 g": the real value is below `value`
};
```

Fields not printed on the label are `null` (or left out of `ingredient`). Never fill them with 0.

## 2. Food photo -> foods with nutrition

`POST /ingredients/scan` (2-5 s)

For a photo of **ingredients / whole foods** (a bench of groceries, a fruit bowl, a tray of vegetables). It names each food it sees and matches it to the nutrition database.

```ts
{
  photoHasFood: boolean;
  model: string;
  ingredients: {
    said: string;                  // what the model saw, e.g. "tomato"
    quantity: string | null;       // what it could count, e.g. "3", "1 bunch", "half"; null if unsure
    food: Food | null;             // best match, nutrition per 100 g (same shape as /foods/search results)
    confidence: { p: number; band: string } | null;   // chance `food` is the right match
    alternatives: { fdcId: number; name: string; description: string }[];  // let the user swap; GET /foods/{fdcId} for nutrition
  }[];
}
```

`quantity` is a count, not a weight. Ask the user for grams (or use the food's portions from `GET /foods/{fdcId}`) before totalling nutrition.

Lighter option: `POST /ingredients/identify` (1-3 s) returns just the names, `{photoHasFood, ingredients: ["tofu", "lemon"]}`. Feed them to `POST /foods/resolve` `{terms: [...]}` to get the same foods.

**Not supported:** a photo of a plated or mixed meal giving total calories. Scan names the visible foods but does not estimate portion weights.

## Errors

`{"error": {"code": "...", "message": "..."}}`. The ones you'll see here:

| Status | Code | Meaning |
|---|---|---|
| 400 | `EMPTY_IMAGE` | No image in the body |
| 413 | `IMAGE_TOO_LARGE` | Over 8 MB |
| 415 | — | Not a JPEG/PNG/WebP/GIF |
| 401 | `API_KEY_REQUIRED` / `API_KEY_INVALID` | Key missing / wrong |
| 403 | `SCOPE_REQUIRED` | Key lacks `labels` |
| 429 | `RATE_LIMITED` | Too many requests this minute |
| 502 | — | The vision model failed; retry once |

## Example

```bash
curl -s -X POST "$BASE/labels/read?ingredient=1&name=Rolled%20oats" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: image/jpeg" --data-binary @label.jpg

curl -s -X POST "$BASE/ingredients/scan" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: image/jpeg" --data-binary @groceries.jpg
```
