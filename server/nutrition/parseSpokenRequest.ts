// Turns a spoken sentence into resolved ingredients plus stated nutrition goals.
//
// This is the server half of "speak what you want and build a recipe from our
// own nutrition database". Two stages:
//
//   1. Deterministic. Split the text on list separators, read any amount tied to
//      a food ("100 grams of rice", "500 calories of bread") and any whole-meal
//      goal ("600 calories total", "40 grams of protein", "30% protein"), and
//      resolve each food against the local database. Most utterances need
//      nothing else.
//   2. Model, when stage 1 leaves something unresolved or a number it could not
//      place ("five hundred calories of bread", "2 eggs"). The model splits
//      prose, repairs misspellings, and sorts figures into per-food amounts and
//      whole-meal goals.
//
// The model never supplies nutrition. Every value on the way back comes from a
// database row, because a hallucinated calorie figure is worse than a missing
// ingredient.
import type { MatchCertainty, SpokenQuantity, SpokenTarget } from '../../shared/types/spoken.ts';
import { confidenceFor } from '../../db/lab/confidence.mjs';
import { resolveFood, resolveFoodConf, type NutritionRow } from './nutritionDb.ts';

// A local Ollama by default. On a server without one, set LOOKUP_OLLAMA_URL to
// https://ollama.com: the hosted API takes OLLAMA_API_KEY and model names
// without the ":cloud" suffix the local daemon uses for the same models.
const OLLAMA = (process.env.LOOKUP_OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const HOSTED = /^https:\/\/(?:www\.)?ollama\.com$/.test(OLLAMA);
const LOOKUP_MODEL = process.env.LOOKUP_MODEL || 'nemotron-3-super:cloud';
const MODEL = HOSTED ? LOOKUP_MODEL.replace(/:cloud$/, '') : LOOKUP_MODEL;
const MAX_ITEMS = 8;
const MIN_TERM_LENGTH = 2;
const KJ_PER_KCAL = 4.184;

export type ParsedItem = {
    /** What the cook said, after cleaning. */
    said: string;
    /** The database row, or null when nothing plausible was found. */
    food: NutritionRow | null;
    /** Alternatives, best first, so the UI can offer a correction. */
    alternatives: NutritionRow[];
    /** A fixed amount the cook asked for ("100 grams of rice"), or null. */
    quantity: SpokenQuantity | null;
    /** The confidence model's estimate that `food` is right, or null. */
    certainty: MatchCertainty | null;
};

export type MealPeriod = {
    /** The meal type, matching `MealType` and the default slot ids. */
    mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner';
    /** The word the cook actually used, so the UI can echo it back. */
    said: string;
};

export type ParseResult = {
    items: ParsedItem[];
    targets: SpokenTarget[];
    /** The meal period named in the request, e.g. "lunch", or null. */
    mealPeriod: MealPeriod | null;
    /** True when the model had to be consulted at all. */
    usedModel: boolean;
};

// ---------------------------------------------------------------------------
// Meal period
// ---------------------------------------------------------------------------

/* The meal periods the app knows about, in the ids used by `meal_plan_entries`.
   "supper" and "tea" are included because people say them, and "brunch" is
   close enough to lunch that treating it as lunch is what a user means. */
const MEAL_PERIOD_WORDS: Record<string, 'breakfast' | 'lunch' | 'snack' | 'dinner'> = {
    breakfast: 'breakfast',
    brekkie: 'breakfast',
    brunch: 'breakfast',
    lunch: 'lunch',
    luncheon: 'lunch',
    snack: 'snack',
    snacks: 'snack',
    dinner: 'dinner',
    supper: 'dinner',
    tea: 'dinner',
};

/**
 * Finds a spoken meal period: "breakfast", "something for lunch", "dinner".
 *
 * Uses a whole-word match so "teaspoon" is not read as "tea" and "snacking" is
 * not read as "snack". A single word naming a meal is unambiguous, so this is
 * deterministic and needs no model.
 *
 * Returns the first match in the sentence; a request naming two periods is
 * ambiguous and the caller should treat it as a single meal.
 */
export function detectMealPeriod(text: string): MealPeriod | null {
    const source = String(text ?? '').toLowerCase();
    const pattern = /\b(breakfast|brekkie|brunch|lunch|luncheon|snacks?|dinner|supper|tea)\b/g;

    const match = pattern.exec(source);
    if (!match) return null;

    const said = match[1];
    // "tea" is only a meal when it is not part of "green tea" or "tea spoon";
    // those are foods, and stripping them from an ingredient list would be
    // worse than missing the meal period.
    if (said === 'tea' && /\b(green|black|herbal|iced)\s+tea\b|\btea\s+(spoon|spoons|bag|bags|leaf|leaves)\b/.test(source)) {
        return null;
    }

    const mealType = MEAL_PERIOD_WORDS[said];
    if (!mealType) return null;
    return { mealType, said };
}

/** Removes a meal-period word so it does not become an "ingredient". */
export function stripMealPeriod(text: string, period: MealPeriod | null): string {
    if (!period) return text;
    return text
        .replace(
            new RegExp(String.raw`\b${period.said}\b`, 'gi'),
            ' ',
        )
        .replace(/\s+/g, ' ')
        .replace(/^[\s,;:/+-]+|[\s,;:/+-]+$/g, '')
        .trim();
}

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

const NUTRIENT_ALIASES: Record<string, SpokenTarget['nutrient']> = {
    calories: 'calories', calorie: 'calories', kcal: 'calories', cal: 'calories', cals: 'calories', energy: 'calories',
    protein: 'protein',
    carbs: 'carbs', carb: 'carbs', carbohydrate: 'carbs', carbohydrates: 'carbs',
    fat: 'fat', fats: 'fat',
    fibre: 'fibre', fiber: 'fibre',
    sugar: 'sugar', sugars: 'sugar',
    sodium: 'sodium', salt: 'sodium',
    cholesterol: 'cholesterol',
};

const UNIT_ALIASES: Record<string, SpokenTarget['unit']> = {
    '%': '%', percent: '%', 'per cent': '%',
    g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g',
    mg: 'mg',
    kcal: 'kcal', cal: 'kcal', cals: 'kcal', calorie: 'kcal', calories: 'kcal',
};

// Plausibility ceilings so a mis-transcription cannot produce a silly claim.
const CEILING: Record<SpokenTarget['nutrient'], number> = {
    calories: 20000, protein: 1000, carbs: 1000, fat: 1000,
    fibre: 500, sugar: 1000, sodium: 20000, cholesterol: 20000,
};

// Any unit a figure can carry, longest first so "grams" is not read as "g".
// No leading \b: in "40g" there is no word boundary between "4" and "g".
const ANY_UNIT =
    '(?:kilojoules|kilojoule|kj|kcal|calories|calorie|cals|cal|kilograms|kilogram|kilos|kilo|kg|grams|gram|gms|gm|g|mg|percent|per\\s+cent|%)';
// Units that can size one food: weight or energy, not a percentage or mg.
const FOOD_UNIT =
    '(kilojoules|kilojoule|kj|kcal|calories|calorie|cals|cal|kilograms|kilogram|kilos|kilo|kg|grams|gram|gms|gm|g)';
// A unit must not run on into a word, or "5 grade" would read as 5 g.
const END = '(?![a-z])';
const NUM = String.raw`(\d+(?:\.\d+)?)`;
// Hedges in front of a figure: "about 100 grams", "no more than 600 calories".
const APPROX =
    String.raw`(?:(?:about|around|roughly|approximately|approx|exactly|like|maybe|just|only|at\s+least|at\s+most|up\s+to|no\s+more\s+than|less\s+than|under|over)\s+)?`;
// Words that make a figure about the whole meal: "600 calories total", "a 600 calorie meal".
const MEAL_WORDS = /^(?:(?:in\s+)?total|overall|altogether|all\s+up|for\s+the\s+(?:whole\s+)?meal|(?:the\s+|whole\s+|a\s+)*meal|per\s+serv(?:e|ing))\b/i;
const NUMBER_WORDS =
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|quarter|dozen)\b/i;

const isKilojoules = (unit: string) => /^k(?:ilo)?j/i.test(unit);

// ---------------------------------------------------------------------------
// Whole-meal goals
// ---------------------------------------------------------------------------

/** Builds a checked target, or null when the figure is implausible. */
function makeTarget(
    rawNutrient: string,
    rawAmount: number | string,
    rawUnit: string,
): SpokenTarget | null {
    const nutrient = NUTRIENT_ALIASES[rawNutrient.toLowerCase()];
    if (!nutrient) return null;

    let amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    let unitWord = rawUnit.toLowerCase().replace(/\s+/g, ' ');
    if (isKilojoules(unitWord)) {
        amount = Math.round(amount / KJ_PER_KCAL);
        unitWord = 'kcal';
    }

    // Default the unit when the speaker was vague: calories are kcal,
    // sodium and cholesterol are quoted in mg, everything else in grams.
    const unit: SpokenTarget['unit'] =
        UNIT_ALIASES[unitWord] ??
        (nutrient === 'calories'
            ? 'kcal'
            : nutrient === 'sodium' || nutrient === 'cholesterol'
              ? 'mg'
              : 'g');

    // Calories in grams or a percentage of calories make no sense.
    if (nutrient === 'calories' && unit !== 'kcal') return null;

    // A percentage is a share of energy and cannot exceed 100.
    const ceiling = unit === '%' ? 100 : CEILING[nutrient];
    if (amount > ceiling) return null;

    return { nutrient, amount, unit };
}

/** Adds targets, keeping the first figure per nutrient and unit. */
function addTargets(into: SpokenTarget[], more: SpokenTarget[]): SpokenTarget[] {
    for (const target of more) {
        if (!into.some((t) => t.nutrient === target.nutrient && t.unit === target.unit)) {
            into.push(target);
        }
    }
    return into;
}

/**
 * Pulls stated goals out of the text: "30% protein", "40g protein", "500
 * calories".
 *
 * Regex rather than the model, because these are simple and exact. Running the
 * model for something a pattern can do reliably would add a round-trip and a
 * failure mode to every request.
 *
 * Only figures that name a nutrient count. "Add 200g of rice" is a quantity of
 * food, not a goal, and must not become a target. Callers that know a figure
 * belongs to a food ("500 calories of bread") must not pass it here: a bare
 * "500 calories" is read as a goal.
 */
export function extractTargets(text: string): SpokenTarget[] {
    const source = String(text ?? '').toLowerCase();

    // "<amount><unit> <of> <nutrient>"  e.g. "40g protein", "30 percent protein"
    const afterUnit = new RegExp(
        String.raw`${NUM}\s*(${ANY_UNIT})${END}\s+(?:of\s+|from\s+|in\s+)?([a-z]+)`,
        'gi',
    );
    // "<nutrient> <amount><unit>"  e.g. "protein 40g"
    const beforeUnit = new RegExp(
        String.raw`\b([a-z]+)\s+(?:at\s+|of\s+)?${APPROX}${NUM}\s*(${ANY_UNIT})${END}`,
        'gi',
    );
    // "<amount> calories": here the unit IS the nutrient, so neither pattern
    // above applies. Tried last so "500 kcal protein" still reads as protein.
    const bareCalories = new RegExp(
        String.raw`${NUM}\s*(kilojoules|kilojoule|kj|kcal|calories|calorie|cals|cal)${END}`,
        'gi',
    );

    const targets: SpokenTarget[] = [];
    const add = (target: SpokenTarget | null) => {
        if (target) addTargets(targets, [target]);
    };

    for (const match of source.matchAll(afterUnit)) {
        add(makeTarget(match[3], match[1], match[2]));
    }
    for (const match of source.matchAll(beforeUnit)) {
        add(makeTarget(match[1], match[2], match[3]));
    }
    for (const match of source.matchAll(bareCalories)) {
        add(makeTarget('calories', match[1], match[2]));
    }

    return targets;
}

// ---------------------------------------------------------------------------
// Amounts of one food
// ---------------------------------------------------------------------------

/** Builds a checked amount of one food, or null when it is implausible. */
function makeQuantity(rawAmount: number | string, rawUnit: string): SpokenQuantity | null {
    let amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const unit = rawUnit.toLowerCase();
    if (isKilojoules(unit)) {
        amount /= KJ_PER_KCAL;
    } else if (/^k(?:ilo)?(?:g|gram|grams|s)?$|^kilos?$/.test(unit)) {
        amount *= 1000;
    }

    const kind: SpokenQuantity['unit'] = /^(?:g|gm|gms|gram|grams|kg|kilo|kilos|kilogram|kilograms)$/.test(unit)
        ? 'g'
        : 'kcal';
    amount = Math.round(amount);

    // A single food beyond these is a mis-hearing, not a meal.
    if (amount < 1 || amount > (kind === 'g' ? 3000 : 5000)) return null;
    return { amount, unit: kind };
}

// ---------------------------------------------------------------------------
// Deterministic reading
// ---------------------------------------------------------------------------

/* Leading phrases that carry no ingredient, e.g. "I want some". */
const FILLER_PREFIX =
    /^(?:i\s+(?:want|need|would\s+like|have|have\s+got|'d\s+like)|gimme|give\s+me|let'?s\s+(?:make|cook|use|have)|make\s+(?:me\s+)?|using|use|recipe\s+for|some|a|an|the|of|with|plus|also|then|maybe|about|around)\b\s*/i;

function stripFiller(text: string): string {
    // Strip filler from the front repeatedly: "some of the rice".
    let cleaned = text.trim();
    let previous = '';
    while (cleaned !== previous) {
        previous = cleaned;
        cleaned = cleaned.replace(FILLER_PREFIX, '').trim();
    }
    return cleaned.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Splits a request into its parts: commas, semicolons, slashes, "and", "with". */
function splitParts(text: string): string[] {
    return String(text ?? '')
        .replace(/\s+/g, ' ')
        // "1,000 calories" is one number, not two list items.
        .replace(/(\d),(\d{3})\b/g, '$1$2')
        // "and"/"with" only separate when whole words, so "sandwich" and
        // "brandy" stay intact.
        .split(/\s*(?:,|;|\/|\+|\band\b|\bwith\b|&)\s*/i)
        .map((part) => part.trim())
        .filter(Boolean);
}

/** True when a phrase is only a nutrient or a whole-meal word ("protein", "total"). */
function isGoalWord(phrase: string): boolean {
    const words = stripFiller(phrase).toLowerCase().replace(MEAL_WORDS, '').trim();
    const withoutTrailing = words.replace(/\s+(?:(?:in\s+)?total|overall|altogether|all\s+up)$/, '').trim();
    return withoutTrailing === '' || withoutTrailing in NUTRIENT_ALIASES;
}

export type ReadPart = {
    /** The food named, or null when the part was only a goal. */
    term: string | null;
    quantity: SpokenQuantity | null;
    targets: SpokenTarget[];
};

/**
 * Reads one part of a request.
 *
 *   "100 grams of rice", "rice 100g", "500 calories of bread"  -> food + amount
 *   "600 calories total", "40 grams of protein", "30% protein"  -> goal only
 *   "chicken breast 40g protein"                               -> food + goal
 */
export function readPart(part: string): ReadPart {
    const text = stripFiller(part);

    // "<amount> <unit> [of] <food>"
    const lead = new RegExp(String.raw`^${APPROX}${NUM}\s*${FOOD_UNIT}${END}\s*(?:of\s+|worth\s+of\s+)?(.+)$`, 'i').exec(text);
    if (lead && !isGoalWord(lead[3])) {
        const quantity = makeQuantity(lead[1], lead[2]);
        const term = stripFiller(lead[3]);
        if (quantity && term.length >= MIN_TERM_LENGTH) return { term, quantity, targets: [] };
    }

    // "<food> <amount> <unit> [worth]"
    const trail = new RegExp(String.raw`^(.+?)\s+${APPROX}${NUM}\s*${FOOD_UNIT}${END}(?:\s+worth)?$`, 'i').exec(text);
    if (trail && !isGoalWord(trail[1])) {
        const quantity = makeQuantity(trail[2], trail[3]);
        const term = stripFiller(trail[1]);
        if (quantity && term.length >= MIN_TERM_LENGTH) return { term, quantity, targets: [] };
    }

    // Otherwise any figures are goals; what is left after removing them is the food.
    const targets = extractTargets(text);
    const nutrient = Object.keys(NUTRIENT_ALIASES).join('|');
    let term = text
        .replace(new RegExp(String.raw`${APPROX}${NUM}\s*${ANY_UNIT}${END}(?:\s+(?:of|from|in))?(?:\s+(?:${nutrient})\b)?`, 'gi'), ' ')
        .replace(new RegExp(String.raw`\b(?:${nutrient})\s+(?:at\s+|of\s+)?${APPROX}${NUM}\s*${ANY_UNIT}${END}`, 'gi'), ' ')
        .replace(/\b(?:(?:in\s+)?total|overall|altogether|all\s+up|per\s+serv(?:e|ing)|worth|meal)\b/gi, ' ')
        .replace(/\s+/g, ' ');
    term = stripFiller(term);

    if (term.length < MIN_TERM_LENGTH || isGoalWord(term)) return { term: null, quantity: null, targets };
    return { term, quantity: null, targets };
}

/**
 * Splits a sentence into candidate ingredient names.
 *
 * Deliberately simple and predictable: commas, semicolons, slashes, "and" and
 * "with" separate items. Amounts and goals are removed from the names. Anything
 * the rules get wrong is left for the model.
 */
export function splitIngredientList(text: string): string[] {
    return splitParts(text)
        .map((part) => readPart(part).term)
        .filter((term): term is string => term !== null)
        .slice(0, MAX_ITEMS);
}

/** Reads a whole request: foods with any amounts, and whole-meal goals. */
export function readRequest(text: string): {
    entries: { term: string; quantity: SpokenQuantity | null }[];
    targets: SpokenTarget[];
} {
    const entries: { term: string; quantity: SpokenQuantity | null }[] = [];
    const targets: SpokenTarget[] = [];

    for (const part of splitParts(text)) {
        const read = readPart(part);
        addTargets(targets, read.targets);
        if (read.term && entries.length < MAX_ITEMS) {
            entries.push({ term: read.term, quantity: read.quantity });
        }
    }

    return { entries, targets };
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const MODEL_PROMPT = `You read a cook's spoken or typed request for one meal and turn it into JSON for a meal generator. Speech-to-text may have misheard words.

INGREDIENTS ("items")
- One entry per food, named the way a nutrition database would ("chicken breast", "brown rice", "greek yoghurt"). Fix mishearings and misspellings ("brockley" -> "broccoli", "keen wa" -> "quinoa"); if unsure, keep the words as said.
- If the cook gave an amount FOR THAT FOOD, add it:
  - weight of the food -> "amount" in grams, "unit":"g"  ("100 grams of rice", "rice, 100g", "half a kilo of mince" -> 500)
  - energy of the food -> "amount" in kcal, "unit":"kcal"  ("500 calories of bread", "bread, 500 cals", "a 300 calorie serve of pasta"; kilojoules / 4.184)
- Counts, cups, spoons, slices and vague sizes ("2 eggs", "a cup of milk", "a handful of nuts", "lots of garlic") are NOT amounts: give just the food.
- Never invent a food that was not said, never repeat one, and never list a nutrient ("protein", "calories", "carbs") or the meal itself as a food.

WHOLE-MEAL GOALS ("totals")
- A figure for the whole meal, not one food: "600 calories total", "a 600 calorie meal", "keep it under 600 calories", "40 grams of protein", "40g protein", "30 percent protein", "high protein, 35%".
  - calories -> {"nutrient":"calories","amount":600,"unit":"kcal"}  (kilojoules / 4.184)
  - grams of a nutrient -> {"nutrient":"protein","amount":40,"unit":"g"}
  - a percentage -> {"nutrient":"protein","amount":30,"unit":"%"}
  - nutrient is one of: calories, protein, carbs, fat, fibre, sugar, sodium (sodium in mg)
- "X grams of protein/carbs/fat/fibre/sugar" is always a goal, never a food.
- "X calories" with no food attached is a goal. "X calories of <food>" or "<food>, X calories" is that food's amount.
- Spoken numbers count: "five hundred" = 500, "one fifty" = 150.
- Ignore meal times ("for dinner") and anything that is neither a food nor a goal.

Reply with ONLY minified JSON in exactly this shape, no other text:
{"items":[{"name":"rice","amount":100,"unit":"g"},{"name":"chicken breast"}],"totals":[{"nutrient":"protein","amount":40,"unit":"g"}]}

Examples
"500 calories of bread and some chicken, 40 grams of protein"
{"items":[{"name":"bread","amount":500,"unit":"kcal"},{"name":"chicken"}],"totals":[{"nutrient":"protein","amount":40,"unit":"g"}]}
"a hundred grams of rice with salmon and brocoli, 600 calories total, 30 percent protein"
{"items":[{"name":"rice","amount":100,"unit":"g"},{"name":"salmon"},{"name":"broccoli"}],"totals":[{"nutrient":"calories","amount":600,"unit":"kcal"},{"nutrient":"protein","amount":30,"unit":"%"}]}
"2 eggs, toast and avo, about 450 calories"
{"items":[{"name":"eggs"},{"name":"toast"},{"name":"avocado"}],"totals":[{"nutrient":"calories","amount":450,"unit":"kcal"}]}`;

export type ModelReading = {
    items: { name: string; quantity: SpokenQuantity | null }[];
    totals: SpokenTarget[];
};

/**
 * Asks the model to read the request.
 *
 * Returns null when nothing usable came back, so the caller keeps whatever the
 * deterministic stage produced rather than inventing an answer.
 */
async function askModel(text: string): Promise<ModelReading | null> {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(HOSTED && process.env.OLLAMA_API_KEY && { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }),
        },
        body: JSON.stringify({
            model: MODEL,
            stream: false,
            keep_alive: '15m',
            // Top-level. Nested inside options it is silently ignored, and the
            // reasoning models then spend the whole budget thinking.
            think: false,
            format: 'json',
            options: { temperature: 0, num_predict: 400, num_ctx: 4096 },
            messages: [
                { role: 'system', content: MODEL_PROMPT },
                { role: 'user', content: text },
            ],
        }),
    });

    if (!response.ok) throw new Error(`model HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    return parseModelReply(data.message?.content);
}

function cleanName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const clean = value
        .replace(/\s+/g, ' ')
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
        .trim();
    return clean.length >= MIN_TERM_LENGTH ? clean : null;
}

/** Reads the model's reply, checking every figure. Exported for tests. */
export function parseModelReply(content: unknown): ModelReading | null {
    const text = String(content ?? '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }

    const rawItems = (parsed as { items?: unknown })?.items;
    const rawTotals = (parsed as { totals?: unknown })?.totals;
    if (!Array.isArray(rawItems)) return null;

    const items: ModelReading['items'] = [];
    for (const entry of rawItems) {
        // Plain strings are accepted too, in case the model drops the objects.
        const record = (typeof entry === 'string' ? { name: entry } : entry) as {
            name?: unknown;
            amount?: unknown;
            unit?: unknown;
        } | null;
        const name = cleanName(record?.name);
        if (!name || items.some((item) => item.name.toLowerCase() === name.toLowerCase())) continue;
        // A nutrient is never a food, whatever the model says.
        if (name.toLowerCase() in NUTRIENT_ALIASES) continue;

        const quantity =
            record && typeof record.amount === 'number' && typeof record.unit === 'string'
                ? makeQuantity(record.amount, record.unit)
                : null;
        items.push({ name, quantity });
        if (items.length >= MAX_ITEMS) break;
    }

    const totals: SpokenTarget[] = [];
    if (Array.isArray(rawTotals)) {
        for (const entry of rawTotals) {
            const record = entry as { nutrient?: unknown; amount?: unknown; unit?: unknown } | null;
            if (typeof record?.nutrient !== 'string' || typeof record.amount !== 'number') continue;
            const target = makeTarget(
                record.nutrient,
                record.amount,
                typeof record.unit === 'string' ? record.unit : '',
            );
            if (target) addTargets(totals, [target]);
        }
    }

    return items.length || totals.length ? { items, totals } : null;
}

/** The item names from a model reply; kept for callers that only want names. */
export function parseModelItems(content: unknown): string[] | null {
    const reading = parseModelReply(content);
    return reading?.items.length ? reading.items.map((item) => item.name) : null;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * The confidence model's estimate for a term's top match (db/lab/confidence.mjs).
 * Best-effort: only the lab database has `resolve_food_conf`, and the estimate
 * is a nicety, never a reason to fail a lookup.
 */
export async function certaintyFor(term: string): Promise<(MatchCertainty & { fdcId: number }) | null> {
    try {
        const rows = await resolveFoodConf(term, 8);
        if (!rows.length) return null;
        const result = await confidenceFor(term, rows);
        if (!result || 'error' in result || !Number.isFinite(result.p)) return null;
        return { fdcId: rows[0].fdc_id, p: result.p, band: result.band.label };
    } catch {
        return null;
    }
}

/** Resolves one name to a best row plus alternatives and a confidence estimate. */
async function resolveOne(term: string, quantity: SpokenQuantity | null = null): Promise<ParsedItem> {
    const [rows, certainty] = await Promise.all([resolveFood(term, 5), certaintyFor(term)]);
    const food = rows[0] ?? null;
    return {
        said: term,
        food,
        alternatives: rows.slice(1, 4),
        quantity,
        // Same ranking, but only trust the estimate when it is about the same food.
        certainty:
            food && certainty && certainty.fdcId === food.fdc_id
                ? { p: certainty.p, band: certainty.band }
                : null,
    };
}

/**
 * True when the deterministic stage is good enough to skip the model.
 *
 * A `confident` or `probable` tier means a synonym or description prefix claimed
 * the term. `weak` means only trigram noise matched, which is exactly when a
 * second opinion earns its round-trip.
 */
function isSettled(item: ParsedItem): boolean {
    if (!item.food) return false;
    return item.food.tier === 'confident' || item.food.tier === 'probable';
}

/** True when a number was left in a food name, i.e. a figure the rules could not place. */
function hasStrayNumber(term: string): boolean {
    return /\d/.test(term) || NUMBER_WORDS.test(term);
}

/** One entry per database food, keeping the first (and any amount a later one had). */
function dedupeByFood(items: ParsedItem[]): ParsedItem[] {
    const out: ParsedItem[] = [];
    for (const item of items) {
        const same = item.food && out.find((o) => o.food?.fdc_id === item.food?.fdc_id);
        if (same) {
            same.quantity ??= item.quantity;
            continue;
        }
        out.push(item);
    }
    return out;
}

/**
 * Parses a spoken request into ingredients, per-food amounts and stated goals.
 *
 * `allowModel` can force the model off, which the tests rely on.
 */
export async function parseSpokenRequest(
    text: string,
    { allowModel = true }: { allowModel?: boolean } = {},
): Promise<ParseResult> {
    const said = String(text ?? '');

    // A meal period is removed before splitting, so "dinner" does not become an
    // ingredient the database then has to fail to match.
    const mealPeriod = detectMealPeriod(said);
    const forIngredients = stripMealPeriod(said, mealPeriod);

    const read = readRequest(forIngredients);
    let targets = read.targets;
    let items = await Promise.all(read.entries.map((entry) => resolveOne(entry.term, entry.quantity)));
    let usedModel = false;

    const needsHelp =
        !items.length ||
        items.some((item) => !isSettled(item)) ||
        read.entries.some((entry) => hasStrayNumber(entry.term));

    if (allowModel && needsHelp) {
        try {
            const modelled = await askModel(forIngredients);
            if (modelled) {
                usedModel = true;
                // Reuse a deterministic match the model agrees on; only chase the rest.
                const byName = new Map(items.map((item) => [item.said.toLowerCase(), item]));
                const fromModel = await Promise.all(
                    modelled.items.map(async ({ name, quantity }) => {
                        const known = byName.get(name.toLowerCase());
                        const base = known && isSettled(known) ? known : await resolveOne(name);
                        return { ...base, quantity: quantity ?? known?.quantity ?? null };
                    }),
                );

                // Prefer the model's reading, but keep any settled deterministic
                // result it did not mention so a good match is never dropped.
                const mentioned = new Set(modelled.items.map((item) => item.name.toLowerCase()));
                const merged = [
                    ...fromModel,
                    ...items.filter((item) => isSettled(item) && !mentioned.has(item.said.toLowerCase())),
                ];
                if (merged.length) items = merged;

                // The model sorts figures more reliably than the rules when the
                // two disagree, so its goals come first.
                targets = addTargets([...modelled.totals], targets);
            }
        } catch (error) {
            // The model is an enhancement, never a dependency.
            console.error('spoken-parse model failed:', error);
        }
    }

    items = dedupeByFood(items).slice(0, MAX_ITEMS);

    // A calorie figure that became one food's amount is not also the meal's goal.
    targets = targets.filter(
        (target) =>
            !(
                target.nutrient === 'calories' &&
                items.some((item) => item.quantity?.unit === 'kcal' && item.quantity.amount === target.amount)
            ),
    );

    return { items, targets, mealPeriod, usedModel };
}
