# MealMaker API: guide for coding agents

You are building a front end (or tool) on the MealMaker backend. This file is
self-contained: read it and you can use every endpoint. Longer prose version for
humans: [api.md](api.md). Type definitions: `shared/types/spoken.ts` and
`shared/types/types.ts`.

**Always work from the latest copy.** The server serves this guide, kept up to
date as the API changes:

```
GET https://mealmaker.brotherk3d.com/api/v1/docs              # markdown (no key needed)
GET https://mealmaker.brotherk3d.com/api/v1/docs?format=json  # { markdown, version, updated }
```

Fetch it at the start of each session. To check for changes cheaply, send the
`ETag` from your last fetch as `If-None-Match`; an unchanged guide answers `304`
with no body. It ends with a table of the endpoints the server actually has,
generated from the server itself, so trust that table over any copy you saved.

## What it is

A JSON HTTP API over a nutrition database (about 7,800 USDA foods, with a tuned
search, everyday-name synonyms, anti-nutrient notes and AI-generated thumbnails) plus
three smart features: parsing a spoken or typed sentence into ingredients with amounts
and meal goals, speech-to-text, and recipe generation.

## Servers

| Name | Base URL | Notes |
| --- | --- | --- |
| production | `https://mealmaker.brotherk3d.com/api/v1` | Stable. Use for anything real. |
| dev | `http://192.168.4.48:3020/api/v1` | Kieran's PC, home network only, only while it is on. Restarts whenever backend code is saved. |

Keys are per server. The key you were given says which it is: `mm_live_...` is
production, `mm_dev_...` is dev. Put the base URL and key in config, never hard-code
the key in committed files (use an env var such as `MEALMAKER_API_KEY`).

A page served over `https://` cannot call the `http://` dev server (mixed content).
Develop on `http://localhost` when using dev, or use production.

## Auth

Every endpoint except `GET /`, `GET /health`, `GET /docs` and `GET /thumbnails/<id>.webp` needs:

```
Authorization: Bearer <key>
```

CORS is open, so a browser app on any origin can call the API directly. Keys have
**scopes** (`foods`, `parse`, `voice`, `generate`) and a **per-minute rate limit**;
check yours with `GET /me`. Responses include `X-RateLimit-Limit` and
`X-RateLimit-Remaining`; a `429` includes `Retry-After` seconds.

Errors always look like `{"error":{"code":"...","message":"..."}}`. Codes you will meet:
`API_KEY_REQUIRED`/`API_KEY_INVALID` (401), `SCOPE_REQUIRED` (403), `INVALID_*` (400),
`NOT_FOUND` (404), `RATE_LIMITED` (429), `DATABASE_UNAVAILABLE`/`TRANSCRIPTION_FAILED`/
`PARSE_FAILED` (5xx, backend problem; retry later). Always branch on `error.code`, not
the message.

## Endpoints at a glance

| Method and path | Scope | Purpose |
| --- | --- | --- |
| `GET /` | none | Lists endpoints. |
| `GET /health` | none | `{ok, database}`; 503 if the database is down. |
| `GET /docs` | none | This guide, latest version (markdown; `?format=json`). |
| `GET /me` | any | Your key's name, scopes, limit. |
| `GET /foods/search?q=&limit=` | foods | Ranked foods for typed text (q 2-100 chars, limit 1-25, default 8). |
| `GET /foods/{fdcId}` | foods | One food, every nutrient per 100 g, synonyms. |
| `POST /foods/resolve` | foods | `{terms:[...up to 25], alternatives?:0-5}` -> best food per term. |
| `GET /thumbnails/{fdcId}.webp` | none | Food picture (square WebP). 404 when none exists yet. |
| `POST /parse` | parse | `{text}` -> ingredients, per-food amounts, meal goals. |
| `POST /transcribe` | voice | Raw audio body -> `{text}`. |
| `POST /voice` | voice | Raw audio body -> `/parse` result plus `text`. |
| `POST /meals/generate` | generate | Ingredients + goals -> a recipe. About 2-3 s (up to ~5 s), paid. |

## Data you will handle

**Food search result** (`/foods/search`, `/foods/resolve`):

```ts
type Food = {
  fdcId: number;                     // stable id; use it as the key everywhere
  description: string;               // official USDA name, long
  category: string | null;
  thumbnailUrl: string;              // path on the same server, e.g. /api/v1/thumbnails/169756.webp
  match: { tier: 'confident' | 'probable' | 'ambiguous' | 'weak'; score: number; matchedVia: string };
  per100g: {                         // any field can be null = unknown (NOT zero)
    kcal; proteinG; carbsG; fatG; sugarG; fibreG; satFatG; sodiumMg;
    cholesterolMg; potassiumMg; calciumMg; ironMg; vitaminCMg;
  };
  antinutrients: { compound: string; name: string; level: string; finding: string; mitigation: string | null }[];
};
// search response: { query, results: Food[], topConfidence: {p: number /*0-1*/, band: string} | null }
```

`topConfidence.p` is the estimated probability the **first** result is what the user
meant. Show it as a percentage or colour (suggested: >=80% green, 50-80% amber, <50%
red) and let the user pick an alternative when it is low. Do not use it for results
after the first.

**thumbnailUrl** is relative to the server origin, not the `/api/v1` base: build the
image URL as `new URL(thumbnailUrl, serverOrigin)`. Hide the `<img>` on error; many
foods have no picture yet.

**Parse result** (`/parse`, and `/voice` plus `text`):

```ts
type ParseResponse = {
  ingredients: {
    said: string;                              // the user's words for it
    match: { fdcId; description; name; caloriesPer100g; proteinPer100g;
             carbohydratePer100g; fatPer100g; sugarPer100g?; saturatedFatPer100g?;
             fiberPer100g?; nutritionSource: 'usda' } | null;   // null = nothing matched
    alternatives: Match[];
    confidence: 'confident' | 'probable' | 'ambiguous' | 'weak' | null;
    quantity: { amount: number; unit: 'g' | 'kcal' } | null;    // fixed amount of THIS food
    certainty: { p: number; band: string } | null;              // as topConfidence
  }[];
  targets: { nutrient: 'calories'|'protein'|'carbs'|'fat'|'fibre'|'sugar'|'sodium'|'cholesterol';
             amount: number; unit: '%' | 'g' | 'mg' | 'kcal' }[]; // goals for the WHOLE meal
  mealPeriod: { mealType: 'breakfast'|'lunch'|'snack'|'dinner'; said: string } | null;
  usedModel: boolean;                          // true = slower language-model path
};
```

How speech maps: "100 grams of rice", "rice 100g", "500 calories of bread" become an
ingredient `quantity`. "600 calories total", "a 600 calorie meal", "40 grams of
protein", "30 percent protein" become `targets`. "2 eggs" or "a cup of milk" are not
quantities (only grams and calories are supported).

**Generate request and response:**

```ts
// POST /meals/generate
{
  ingredients: { name: string; fixedAmount?: { amount: number; unit: 'g' | 'kcal' } }[],  // 1-20
  requirements?: { calories?: number /*per serving*/; proteinGrams?: number; proteinPercentage?: number;
                   servings?: number; mealType?: 'breakfast'|'lunch'|'dinner'|'snack';
                   dietary?: ('vegetarian'|'vegan'|'dairy-free'|'gluten-free')[];
                   variation?: 'different'|'higher-protein'|'lower-calorie'; previousMealName?: string }
}
// -> { mealName, ingredients: { name, weight /*grams per serving*/, fixed?: boolean,
//      caloriesPer100g, proteinPer100g, carbohydratePer100g, fatPer100g, fiberPer100g?,
//      usda?: {fdcId, description}, nutritionSource, micronutrientsPer100g? }[],
//      instructions: string[], servings, considerations?: [...] }
```

An ingredient's `fixedAmount` pins its weight; the others are resized to meet
`calories` and the protein goal. You can pass the `match` objects from `/parse`
(with `fixedAmount` set from `quantity`) to skip a second lookup. Nutrition for an
ingredient = `xPer100g * weight / 100`.

## Recommended flows

**Speak-to-meal (what the main app does):**
1. Record audio (browser `MediaRecorder`; send each pause-delimited clip).
2. `POST /voice` with the clip as the raw body (`Content-Type: application/octet-stream`).
   Append the returned ingredients to a visible list; merge by `fdcId`; keep `targets`.
3. Show each ingredient with its `quantity` tag and its `certainty` percentage.
4. Only when the user confirms ("Create my meal"), `POST /meals/generate` with the list.
   Do not call it on every utterance or keystroke.
5. For typed input, debounce about 1.5 s of inactivity before calling `/parse`.

**Search box:** call `/foods/search` after a short debounce (300 ms), show thumbnails and
`per100g` macros, then `/foods/{fdcId}` for a detail view.

## Practical rules

- `/parse` takes up to 500 characters; JSON bodies are capped at 256 KB; audio at 12 MB
  and about 20 s.
- Typical times: `/foods/search` about 0.1-0.3 s; `/parse` about 0.5 s, plus about 1 s
  when `usedModel` is true; `/transcribe` about 1.3 s; `/meals/generate` about 2-3 s,
  occasionally 5 s. Show progress for generation and disable the button while it runs.
- Treat `null` nutrient values as unknown. Never display them as 0.
- A key in browser code is visible to anyone who opens the page. That is acceptable for
  this project's private use; do not publish a site containing the production key.
- Do not invent endpoints. If you need something that is missing, say so and ask
  Kieran to add it on the backend; the server code is in `server/api/v1.ts`.

## Smoke test

```bash
BASE=https://mealmaker.brotherk3d.com/api/v1
KEY=...   # from your environment
curl -s $BASE/health
curl -s $BASE/me -H "Authorization: Bearer $KEY"
curl -s "$BASE/foods/search?q=capsicum&limit=2" -H "Authorization: Bearer $KEY"
curl -s -X POST $BASE/parse -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"500 calories of bread and 100 grams of rice, 40 grams of protein"}'
```

Food names follow Australian usage where it matters ("silverbeet" finds Swiss chard,
"capsicum" finds peppers, "sirloin" finds top loin).
