# Proposal: meal preferences for `POST /meals/generate`

Status: draft · Requested by: Meal Maker · Date: 2026-11-20

## Why

Meal Maker's Create Meal sheet offers four preferences: **High protein**, **Under 25 mins**,
**Plant based** and **Low carb**. Today only two reach Nutrition Lab, and one of them only
through a workaround:

| Preference    | What Meal Maker sends today   | Problem                                                                   |
| ------------- | ----------------------------- | ------------------------------------------------------------------------- |
| High protein  | `variation: "higher-protein"` | `variation` is meant for "another take on `previousMealName`", not a goal |
| Under 25 mins | nothing                       | not supported; recipes can take an hour                                   |
| Plant based   | `dietary: ["vegan"]`          | works                                                                     |
| Low carb      | nothing                       | not supported                                                             |

Users tick these and get meals that ignore them, which is worse than not offering them.

## Design principles

1. **One new field, named presets.** Clients send the user's words (`"low-carb"`), NL owns
   what they mean. Definitions can then improve without every client changing.
2. **Every preset resolves to numbers you can check.** The response says what each preset
   meant and whether the meal met it, so clients can show it ("Low carb ✓ 18 g carbs").
3. **Explicit numbers win.** If a request sends `proteinGrams: 40` and `high-protein`, the 40 g
   is the target; the preset only fills in what wasn't specified.
4. **Additive and backwards compatible.** Existing requests behave exactly as before.

## Request

Add `requirements.preferences`, plus two plain numeric limits it builds on:

```ts
requirements?: {
  // existing
  calories?: number; proteinGrams?: number; proteinPercentage?: number;
  servings?: number; mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  dietary?: ('vegetarian' | 'vegan' | 'dairy-free' | 'gluten-free')[];
  variation?: 'different' | 'higher-protein' | 'lower-calorie'; previousMealName?: string;

  // new
  preferences?: ('high-protein' | 'quick' | 'plant-based' | 'low-carb')[];
  maxTotalMinutes?: number;          // prep + cook, hands-off time included
  maxCarbohydratePercentage?: number; // % of the serving's energy
}
```

```json
{
    "ingredients": [{ "name": "firm tofu" }, { "name": "broccoli" }],
    "requirements": {
        "calories": 600,
        "preferences": ["high-protein", "quick", "low-carb"]
    }
}
```

Unknown preferences are a `400 INVALID_REQUEST` (consistent with `dietary`), so typos surface
instead of being silently ignored.

## What each preset means

| Preset         | Resolves to                                                 | Notes                                                                                   |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `high-protein` | `proteinPercentage ≥ 30` **and** ≥ 30 g protein per serving | Skipped where `proteinGrams`/`proteinPercentage` is sent; those are the target instead. |
| `quick`        | `maxTotalMinutes: 25`                                       | Total time, including simmering and oven time; not just hands-on time.                  |
| `plant-based`  | `dietary: ["vegan"]`                                        | An alias, so clients can send the user's wording. Same behaviour as today's `vegan`.    |
| `low-carb`     | `maxCarbohydratePercentage: 26`                             | The < 26 % of energy definition of a low-carbohydrate diet (Feinman et al., 2015).      |

Mapping by name (`quick`, not `under-25-minutes`) keeps the time limit tunable; Meal Maker
labels it "Under 25 mins" from the resolved `maxTotalMinutes` in the response.

### How generation uses them

- **Protein and carbs** are portion constraints. The sizing step that already meets
  `calories` and `proteinGrams` adds the protein floor and carb ceiling. If the user's
  ingredients can't meet them at any portion (rice and potatoes for low carb), the model may
  add one fitting ingredient (as it already may for goals) and says so in `considerations`.
- **Time** shapes the recipe, not the portions: method choice (pan-fry, not roast), cuts
  (dice small), canned over dried pulses. Each step gets a duration so the total is checkable.
- **Plant based** follows the existing `dietary` rules, including for supplied ingredients.

## Response

Two additions; everything else is unchanged.

```jsonc
{
    "mealName": "Crispy Garlic Tofu with Broccoli",
    "ingredients": [/* unchanged */],
    "instructions": ["Press and cube the tofu…", "…"],

    // new: prep + cook in minutes, hands-off time included
    "time": { "prepMinutes": 8, "cookMinutes": 12, "totalMinutes": 20 },

    // new: one entry per requested preference, in request order
    "preferences": [
        {
            "id": "high-protein",
            "met": true,
            "target": {
                "proteinPercentage": { "min": 30 },
                "proteinGrams": { "min": 30 },
            },
            "actual": { "proteinPercentage": 34, "proteinGrams": 41 },
        },
        {
            "id": "quick",
            "met": true,
            "target": { "totalMinutes": { "max": 25 } },
            "actual": { "totalMinutes": 20 },
        },
        {
            "id": "low-carb",
            "met": false,
            "target": { "carbohydratePercentage": { "max": 26 } },
            "actual": { "carbohydratePercentage": 31 },
            "reason": "Rice is fixed at 100 g, which alone is 27 % of the energy.",
        },
    ],
    "considerations": [/* unchanged */],
}
```

- `actual` is computed from the returned ingredients and weights (the same numbers clients
  total), not the model's own estimate, so client and server always agree.
- `met: false` is a normal 200: the meal is still useful and the user can decide. `reason` is
  one plain sentence a client may show as is.

## Conflicts and edge cases

| Case                                                          | Behaviour                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plant-based` with a supplied animal ingredient (chicken)     | Same as `dietary: ["vegan"]` today. Proposal: keep the user's ingredient and report `met: false` with a reason, rather than silently swapping it. |
| `low-carb` with a `fixedAmount` high-carb ingredient          | Fixed amounts are never changed; report `met: false` (example above).                                                                             |
| `high-protein` and `low-carb` together                        | Compatible; protein is sized first, carbs capped after.                                                                                           |
| `high-protein` with `variation: "higher-protein"`             | Both allowed; the variation raises protein above the previous meal, the preset sets the floor.                                                    |
| `quick` with dried beans or whole grains needing long cooking | The model may use the quick form (canned beans, quick oats) and notes it in `considerations`.                                                     |
| `maxTotalMinutes` and `quick` both sent                       | The explicit number wins.                                                                                                                         |

## Validation

- `preferences`: unique values from the list; `400 INVALID_REQUEST` otherwise.
- `maxTotalMinutes`: integer 5–240. `maxCarbohydratePercentage`: 0–100.
- Recommended latency budget is unchanged (2–3 s): presets add constraints, not extra calls.

## Rollout

1. NL ships the fields and response additions behind no flag (additive).
2. Meal Maker sends `preferences` as is and stops mapping High protein to `variation` and
   Plant based to `dietary` (both remain valid for other clients).
3. Meal Maker shows `time.totalMinutes` on Meal Result and a ✓ / note per preference.

## Open questions

1. Should `plant-based` mean strictly vegan, or allow honey? (Proposal: strictly vegan, matching
   today's mapping.)
2. Should `quick` be configurable per request (15 / 25 / 40 minutes) via `maxTotalMinutes` only,
   or should there be a second preset (`very-quick`)? (Proposal: numbers only.)
3. Is 30 % energy right for `high-protein` on snacks, where 30 g is a lot? (Proposal: for
   `mealType: "snack"`, only the percentage applies.)

## References

- Feinman RD et al. (2015), _Dietary carbohydrate restriction as the first approach in
  diabetes management_, Nutrition 31(1). Low-carbohydrate: < 130 g/day or < 26 % of energy.
  Summary table: [PMC7177487](https://pmc.ncbi.nlm.nih.gov/articles/PMC7177487),
  [StatPearls: Low-Carbohydrate Diet](https://www.ncbi.nlm.nih.gov/books/NBK537084).
- Current API: [`api.md` › `POST /meals/generate`](./api.md).
