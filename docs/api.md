# MealMaker API

Everything the MealMaker app does with food data, as a JSON API you can build any
interface on: food search with nutrition and pictures, turning speech or a typed
sentence into ingredients, and generating a recipe.

| Server | Base URL | For |
| --- | --- | --- |
| Kieran's PC (home network) | `http://192.168.4.48:3020/api/v1` | Live development. Changes to the API show up here first. |
| Production (VPS) | `https://mealmaker.brotherk3d.com/api/v1` | The real thing. Updated when we deploy. |

Open the base URL in a browser to see every endpoint and the scope it needs. The
latest version of the guide for coding agents is always at `GET /api/v1/docs` (no
key needed); see below.

## Keys

Every endpoint except `/`, `/health` and `/thumbnails` needs an API key. Send it as a
header:

```
Authorization: Bearer mm_dev_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

(`X-API-Key: <key>` works too.) Keys are separate per server: a key made on Kieran's
PC only works there, and a production key only works on production.

Each key has **scopes**, which decide what it can call, and a **per-minute limit**:

| Scope | Allows |
| --- | --- |
| `foods` | search, food details, batch resolve |
| `parse` | sentence → ingredients and goals |
| `voice` | audio → text, and audio → ingredients |
| `generate` | recipe generation (calls a paid model, so keep an eye on it) |

Every keyed response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the
limit you get `429` with a `Retry-After` header (seconds).

Calls from any website are allowed (CORS is open), so a dev server on your own
machine can call the API directly. A key in front-end code can be read by anyone who
opens the page, so use a dev key for development and don't ship one in a public site.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "API_KEY_INVALID", "message": "That API key is not valid or has been revoked." } }
```

| Status | Typical codes |
| --- | --- |
| 400 | `INVALID_QUERY`, `INVALID_TERMS`, `INVALID_REQUEST`, `INVALID_JSON` |
| 401 | `API_KEY_REQUIRED`, `API_KEY_INVALID` |
| 403 | `SCOPE_REQUIRED` |
| 404 | `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` |
| 413 | `BODY_TOO_LARGE`, `AUDIO_TOO_LARGE` |
| 429 | `RATE_LIMITED` |
| 502/503 | `TRANSCRIPTION_FAILED`, `DATABASE_UNAVAILABLE`, `PARSE_FAILED` (something behind the API is down) |

## A first call

```js
const API = 'http://192.168.4.48:3020/api/v1';
const KEY = 'mm_dev_...';

async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${KEY}`, ...options.headers },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
    return body;
}

const { results, topConfidence } = await api('/foods/search?q=sirloin steak&limit=3');
```

If your page is served over `https://`, the browser blocks calls to the `http://` home
server. Run your dev server on plain `http://` (or `localhost`) when using it.

---

## Endpoints

### `GET /health` (public)

`{ "ok": true, "database": true }`. Returns `503` with `ok: false` when the database
can't be reached.

### `GET /docs` (public)

The usage guide for coding agents (`docs/api-for-agents.md`), always the version this
server runs, with a table of its endpoints appended. Markdown by default;
`?format=json` returns `{ "markdown", "version", "updated" }`. Send the last `ETag` as
`If-None-Match` to get `304` when nothing has changed.

### `GET /me` (any key)

The key you are using: `{ "name", "prefix", "scopes", "ratePerMinute" }`.

### `GET /foods/search?q=<text>&limit=<1-25>` (`foods`)

What a search box would show for the typed text, best first. `q` is 2-100 characters;
`limit` defaults to 8.

```json
{
  "query": "sirloin steak",
  "results": [
    {
      "fdcId": 174011,
      "description": "Beef, loin, top loin steak, boneless, lip-on, separable lean only, ...",
      "category": "Beef Products",
      "thumbnailUrl": "/api/v1/thumbnails/174011.webp",
      "match": { "tier": "confident", "score": 1.3, "matchedVia": "name:common:sirloin steak" },
      "per100g": {
        "kcal": 143, "proteinG": 23.07, "carbsG": 0, "fatG": 5.67, "sugarG": 0, "fibreG": 0,
        "satFatG": 2.345, "sodiumMg": 46, "cholesterolMg": 60, "potassiumMg": 284,
        "calciumMg": 15, "ironMg": 1.84, "vitaminCMg": 0
      },
      "antinutrients": []
    }
  ],
  "topConfidence": { "p": 0.953, "band": "very high" }
}
```

- `match.tier` is the resolver's own verdict: `confident`, `probable`, `ambiguous` or `weak`.
- `topConfidence.p` is the estimated chance (0-1) that the **first** result is the food
  the person meant, from a model trained on judged searches. It is `null` when it
  can't be worked out. Shown as a percentage in the app.
- Any nutrient can be `null` when the database has no value for it. That means
  unknown, not zero.
- `antinutrients` lists flagged compounds (oxalate, lectins, ...) with
  `{ compound, name, level, finding, mitigation }`.
- `thumbnailUrl` is relative to the server. Most foods have a picture; the ones
  that don't return `404`, so hide the image on error.

### `GET /foods/<fdcId>` (`foods`)

One food in full: every nutrient the database has for it, per 100 g, and the other
names it is found by.

```json
{
  "fdcId": 169756,
  "description": "Rice, white, long-grain, regular, raw, unenriched",
  "category": "Cereal Grains and Pasta",
  "scope": "core",
  "dataType": "sr_legacy_food",
  "thumbnailUrl": "/api/v1/thumbnails/169756.webp",
  "nutrientsPer100g": [ { "nbr": "203", "name": "Protein", "unit": "G", "amount": 7.13 }, ... ],
  "synonyms": ["long grain white rice", "raw white rice"]
}
```

### `POST /foods/resolve` (`foods`)

The best food for each of up to 25 names in one call, e.g. to turn a shopping list into
foods.

```json
// request
{ "terms": ["silverbeet", "capsicum"], "alternatives": 2 }
// response
{ "results": [
    { "term": "capsicum", "food": { ...same shape as a search result... },
      "confidence": { "p": 0.98, "band": "very high" }, "alternatives": [ ... ] }
] }
```

`food` is `null` when nothing matched. `alternatives` (0-5, default 0) adds runner-up
foods.

### `GET /thumbnails/<fdcId>.webp` (public)

The food's picture: square WebP, cached for an hour. No key is needed, so it works in a
plain `<img src>`:

```html
<img src="http://192.168.4.48:3020/api/v1/thumbnails/169756.webp" onerror="this.remove()" alt="">
```

### `POST /parse` (`parse`)

A sentence, as typed or spoken, turned into ingredients, amounts and meal goals. This
is what the app's "Speak your ingredients" box calls after each pause.

```json
// request
{ "text": "500 calories of bread and 100 grams of rice with chicken, 40 grams of protein for dinner" }
```

```json
// response
{
  "ingredients": [
    {
      "said": "bread",
      "match": { "fdcId": 172686, "description": "Bread, white, ...", "name": "...",
                 "caloriesPer100g": 266, "proteinPer100g": 8.85, "carbohydratePer100g": 49.42,
                 "fatPer100g": 3.33, "sugarPer100g": 5.67, "saturatedFatPer100g": 0.6,
                 "fiberPer100g": 2.3, "nutritionSource": "usda" },
      "alternatives": [ ... ],
      "confidence": "confident",
      "quantity": { "amount": 500, "unit": "kcal" },
      "certainty": { "p": 0.99, "band": "very high" }
    }
  ],
  "targets": [ { "nutrient": "protein", "amount": 40, "unit": "g" } ],
  "mealPeriod": { "mealType": "dinner", "said": "dinner" },
  "usedModel": false
}
```

- **`quantity`** is an amount the person tied to one food: `"100 grams of rice"` →
  `{100, "g"}`, `"500 calories of bread"` → `{500, "kcal"}`. Kilograms and kilojoules
  are converted. It is `null` when no amount was given. Counts like "2 eggs" are not
  amounts.
- **`targets`** are goals for the whole meal: `"600 calories total"`,
  `"40 grams of protein"`, `"30 percent protein"`. `unit` is `kcal`, `g`, `mg` or `%`
  (a share of the meal's energy).
- **`certainty`** is the same confidence estimate as `topConfidence` in search.
- **`usedModel`** is true when the sentence needed the language model (spelled-out
  numbers, mishearings, prose). That adds about 1 s (typically 0.7-1.1 s).
- Up to 500 characters per call.

The full types are in `shared/types/spoken.ts` (`ParseRecipeResponse`).

### `POST /transcribe` (`voice`)

Audio in, text out. Send the raw recording as the body (not a form): WebM/Opus from
Chrome's `MediaRecorder`, MP4 from Safari, WAV or MP3. Keep clips under 20 seconds.

```js
const blob = new Blob(chunks, { type: recorder.mimeType });  // from MediaRecorder
const { text } = await api('/transcribe', { method: 'POST', body: blob });
```

### `POST /voice` (`voice`)

Transcribe and parse in one call. Same body as `/transcribe`; the response is
`/parse`'s with the transcript added as `text`.

### `POST /meals/generate` (`generate`)

A recipe from ingredients and goals. This usually takes 2-3 s (occasionally up to
about 5 s) and calls a paid model, so show progress and don't fire it on every
keystroke.

```json
// request
{
  "ingredients": [
    { "name": "rice", "fixedAmount": { "amount": 100, "unit": "g" } },
    { "name": "chicken breast" },
    { "name": "broccoli" }
  ],
  "requirements": { "calories": 600, "proteinGrams": 45, "mealType": "dinner" }
}
```

- Ingredients only need a `name`; nutrition is looked up. Passing a `/parse` `match`
  object (plus `fixedAmount`) also works and skips the lookup.
- `fixedAmount` keeps that ingredient at exactly that amount, and the others are sized
  around it to meet the goals.
- `requirements` (all optional):
  - `calories` (per serving)
  - `proteinGrams` or `proteinPercentage`
  - `servings`
  - `mealType`: `breakfast`, `lunch`, `dinner` or `snack`
  - `dietary`: any of `vegetarian`, `vegan`, `dairy-free`, `gluten-free`
  - `variation`: `different`, `higher-protein` or `lower-calorie`, with `previousMealName`

```json
// response
{
  "mealName": "Lemon Garlic Chicken with Steamed Broccoli and Rice",
  "ingredients": [
    { "name": "rice", "weight": 100, "fixed": true, "caloriesPer100g": 365, "proteinPer100g": 7.13,
      "carbohydratePer100g": 79.95, "fatPer100g": 0.66, "fiberPer100g": 1.3,
      "usda": { "fdcId": 169756, "description": "..." }, "nutritionSource": "usda",
      "micronutrientsPer100g": { ... } }
  ],
  "instructions": ["Rinse the rice...", "..."],
  "servings": 1,
  "considerations": [ { "...": "food-safety and preparation notes" } ]
}
```

Weights are grams per serving. Multiply `xPer100g × weight / 100` for each ingredient's
share. The full types are in `shared/types/types.ts` (`GenerateMealRequest`,
`GenerateMealResponse`).
