import type {
    DayContext,
    DietaryPreference,
    GenerateMealRequest,
    GenerateMealResponse,
    MealType,
} from '../../../shared/types/types.ts';
import {
    formatConsiderationsForPrompt,
    getPrepConsiderations,
} from '../../../shared/nutrition/prepGuidance.ts';
import { OllamaAiClient } from '../../ai/OllamaAiClient.js';
import { matchIngredient } from '../../nutrition/matchIngredients.ts';
import { isGenerateMealResponse } from './validateMealResponse.js';
import { calibrateMeal, fixedGrams, getMealTotals } from '../calibrateMeal.js';
import {
    enrichIngredients,
    getEstimatedIngredients,
    namesForGuidance,
    pairWithInputs,
    reattachNutrition,
    type EnrichedIngredient,
    type MatchLookup,
} from '../authoritativeNutrition.ts';

const DEFAULT_PROTEIN_PERCENTAGE = 15;
// Carbs and fat share the remaining energy in the default 55:30 ratio.
const CARB_SHARE_OF_REMAINDER = 55 / 85;

export function getMacroSplit(proteinPercentage?: number) {
    const protein =
        typeof proteinPercentage === 'number' &&
        Number.isFinite(proteinPercentage) &&
        proteinPercentage > 0
            ? Math.min(Math.round(proteinPercentage), 80)
            : DEFAULT_PROTEIN_PERCENTAGE;
    const carbs = Math.round((100 - protein) * CARB_SHARE_OF_REMAINDER);

    return { carbs, protein, fat: 100 - protein - carbs };
}

const MEAL_TYPE_GUIDANCE: Record<MealType, string> = {
    breakfast: 'a breakfast dish',
    lunch: 'a lunch dish',
    dinner: 'a dinner dish',
    snack: 'a small snack',
};

const DIETARY_GUIDANCE: Record<DietaryPreference, string> = {
    vegetarian: 'vegetarian (no meat, poultry, fish or seafood)',
    vegan: 'vegan (no animal products, including dairy, eggs and honey)',
    'dairy-free': 'dairy-free (no milk, cheese, butter, yoghurt or cream)',
    'gluten-free': 'gluten-free (no wheat, barley, rye or regular oats)',
};


/* The day-planner context as prompt lines, so the dish fits the gap the
   other meals leave. The calorie and protein targets are already this
   meal's share; the daily figures are background. */
function describeDayContext(dayContext: DayContext): string {
    const { dailyTargets: day, plannedSoFar: planned } = dayContext;
    const stillToCome = Math.max(0, Math.round(day.fiberG - planned.fiberG));
    const lines = [
        `- This is the ${dayContext.slotLabel} of a planned day. The target calories and protein above are already this meal's share; the rest is context.`,
        `- Daily targets: ${Math.round(day.calories)} kcal, ${Math.round(day.proteinG)} g protein, ${Math.round(day.carbsG)} g carbs, ${Math.round(day.fatG)} g fat, ${Math.round(day.fiberG)} g fibre.`,
        `- Already planned in the day's other meals: ${Math.round(planned.calories)} kcal, ${Math.round(planned.proteinG)} g protein, ${Math.round(planned.carbsG)} g carbs, ${Math.round(planned.fatG)} g fat, ${Math.round(planned.fiberG)} g fibre (${stillToCome} g fibre still to come).`,
    ];

    if (dayContext.focusNutrients && dayContext.focusNutrients.length > 0) {
        lines.push(
            `- The day is short on: ${dayContext.focusNutrients.join(', ')}. Favour preparations and pairings that supply these (e.g. keep skins on, finish with citrus for vitamin C) without leaving the ingredient list or calorie target.`,
        );
    }

    return lines.join('\n');
}

/*
 * The protein share to aim for. A gram goal ("40 grams of protein") wins
 * over a percentage when there's a calorie target to turn it into one;
 * without a calorie target, `caloriesHint` (the meal as generated) stands in.
 */
export function effectiveProteinPercentage(
    requirements: GenerateMealRequest['requirements'],
    caloriesHint?: number,
): number | undefined {
    const calories = requirements.calories ?? caloriesHint;

    if (requirements.proteinGrams !== undefined && calories && calories > 0) {
        return Math.min(80, ((requirements.proteinGrams * 4) / calories) * 100);
    }

    return requirements.proteinPercentage;
}

export function buildMealPrompts(input: GenerateMealRequest): {
    systemPrompt: string;
    userPrompt: string;
} {
    const { requirements } = input;
    const split = getMacroSplit(effectiveProteinPercentage(requirements));
    const fixed = input.ingredients.filter((i) => i.fixedAmount);
    const servings = requirements.servings ?? 1;
    const dietary = requirements.dietary ?? [];
    const variation = requirements.variation;

    const rules: string[] = [];

    if (requirements.mealType) {
        rules.push(
            `- Make it ${MEAL_TYPE_GUIDANCE[requirements.mealType]} suited to ${requirements.mealType}.`,
        );
    }

    if (dietary.length > 0) {
        rules.push(
            `- Dietary requirements are a HARD rule: the meal must be ${dietary
                .map((d) => DIETARY_GUIDANCE[d])
                .join(
                    ' and ',
                )}. Never include an ingredient that violates this. If a provided ingredient conflicts, leave it out.`,
        );
    }

    if (variation === 'different') {
        rules.push(
            requirements.previousMealName
                ? `- Make a clearly different dish from "${requirements.previousMealName}" (different name, style and method).`
                : '- Make a distinctive, different dish from the usual choice.',
        );
    } else if (variation === 'higher-protein') {
        rules.push(
            `- Make the meal noticeably higher in protein than usual; the ${split.protein}% protein target is a minimum.`,
        );
    } else if (variation === 'lower-calorie') {
        rules.push(
            '- Make the meal about 20% lower in calories than the target calories per serving (or than the previous meal if there is no target).',
        );
    }

    if (fixed.length > 0) {
        rules.push(
            '- Ingredients with a "fixedWeight" (grams) are amounts the cook chose: use exactly that weight for them, and size the other ingredients so the whole meal still hits the targets.',
        );
    }

    if (requirements.proteinGrams !== undefined) {
        rules.push(
            `- The cook asked for about ${Math.round(requirements.proteinGrams)} g of protein per serving.`,
        );
    }

    if (requirements.dayContext) {
        rules.push(
            `\nDay context:\n${describeDayContext(requirements.dayContext)}`,
        );
    }

    const prepGuidance = formatConsiderationsForPrompt(
        getPrepConsiderations(input.ingredients.map(({ name }) => name)),
    );

    const systemPrompt = `
You are MealMaker, a meal-planning assistant.

Create one realistic, balanced meal from the provided ingredients.

Priorities, in order:
1. Never break a dietary requirement (if any are given).
2. Use ONLY the provided ingredients (except any left out for dietary reasons), and all of them. Do not add any ingredient that is not in the list: no oil, butter, salt, pepper, garlic, onion, herbs, spices, lemon or lime, vinegar, stock, sauce, sugar, flour or water. The ingredients list in your answer must match the provided list exactly.
3. Hit the target calories per serving: the total must be within 5% of it.
4. Aim for approximately ${split.carbs}% carbs, ${split.protein}% protein, and ${split.fat}% fat by energy.
5. Keep ingredient portions realistic and practical.

Rules:
- Target calories are PER SERVING. Ingredient weights and nutrition are also PER SERVING; do not scale them up for the number of servings.
- Meal calories = sum of (weight × caloriesPer100g / 100). Work this out and adjust the weights until it matches the target before answering.
- Use raw (uncooked) weights, and give nutrition per 100 g for that same raw state (e.g. dry rice, dry oats, raw chicken).
- If no target calories are given, use sensible portions for one person.
- Round ingredient weights to the nearest 5 or 10 g.
- Ingredients with a "nutritionSource" ("usda" or "user") carry authoritative per-100 g data, including fibre. Copy it exactly and never change it.
- For ingredients without a "nutritionSource", estimate nutrition per 100 g.
- Return nutrition per 100 g for every ingredient.
- Return only valid JSON. Do not use Markdown code fences.

Preparation and nutrient absorption (build these into the instructions):
- The instructions are the cooking method, so write every safety or preparation step explicitly, with quantities and times (e.g. "Soak the dried kidney beans for 8-12 hours, discard the soaking water, then boil hard for 10 minutes before simmering until soft").${
        prepGuidance
            ? `
- REQUIRED guidance below must appear as its own explicit step(s); follow the recommended guidance too:
${prepGuidance}`
            : ''
    }
- Choose cooking methods that reduce anti-nutrients: blanch or boil high-oxalate greens (spinach, chard, beet greens) and discard the water rather than serving them raw in large amounts, rinse quinoa before cooking, cook legumes and grains fully.
- Where the provided ingredients allow it, pair foods for absorption: vitamin C foods with plant iron, calcium sources with oxalate-rich foods. Never add an ingredient to do so.
- The instructions may only use the provided ingredients, plus water for cooking and an optional "season to taste" note; they must not name any other ingredient.
- Keep the instructions concise and practical: about 4-8 steps. Don't state ingredient weights in the steps (portions are adjusted after you answer); times, temperatures and water ratios are fine.
${rules.join('\n')}

Response shape:
{
  "mealName": "string",
  "ingredients": [
    {
      "name": "string",
      "weight": 0,
      "caloriesPer100g": 0,
      "proteinPer100g": 0,
      "carbohydratePer100g": 0,
      "fatPer100g": 0,
      "fiberPer100g": 0
    }
  ],
  "instructions": ["string"]
}

Do not return meal-level nutrition totals.
`;

    const userPrompt = JSON.stringify({
        targetCaloriesPerServing: requirements.calories,
        servings,
        targetProteinPercentage: split.protein,
        targetProteinGrams: requirements.proteinGrams,
        mealType: requirements.mealType,
        dietary: dietary.length > 0 ? dietary : undefined,
        variation,
        previousMealName: requirements.previousMealName,
        ingredients: input.ingredients.map(toPromptIngredient),
    });

    return { systemPrompt, userPrompt };
}

/* Authoritative per-100 g macros and fibre for the model. Micronutrients
   stay server-side and are re-attached after generation. */
function toPromptIngredient(ingredient: EnrichedIngredient) {
    return {
        name: ingredient.name,
        caloriesPer100g: ingredient.caloriesPer100g,
        proteinPer100g: ingredient.proteinPer100g,
        carbohydratePer100g: ingredient.carbohydratePer100g,
        fatPer100g: ingredient.fatPer100g,
        fiberPer100g: ingredient.fiberPer100g,
        nutritionSource: ingredient.nutritionSource,
        fixedWeight: ingredient.fixedAmount
            ? (fixedGrams(ingredient.fixedAmount, ingredient.caloriesPer100g) ??
              undefined)
            : undefined,
    };
}

/*
 * Scale the model's portions onto the requested targets (see
 * calibrateMeal). Without a calorie target there's nothing to hit, except
 * that "higher protein" still lifts the protein share.
 */
export function calibrateToRequirements(
    ingredients: GenerateMealResponse['ingredients'],
    requirements: GenerateMealRequest['requirements'],
) {
    const current = getMealTotals(ingredients);
    let calories = requirements.calories;
    let proteinPercentage = effectiveProteinPercentage(
        requirements,
        current.calories,
    );

    // A gram goal with no calorie target still needs one to solve against:
    // keep the meal's own size and move the protein share.
    if (requirements.proteinGrams !== undefined) {
        calories ??= current.calories;
    }

    if (calories !== undefined && requirements.variation === 'lower-calorie') {
        calories *= 0.8;
    }

    if (requirements.variation === 'higher-protein') {
        proteinPercentage = Math.max(
            proteinPercentage ?? 0,
            Math.min(current.proteinPercentage + 8, 60),
        );
        calories ??= current.calories;
    }

    if (calories === undefined) return ingredients;

    return calibrateMeal(ingredients, { calories, proteinPercentage });
}

// A USDA outage shouldn't fail the meal: those ingredients are estimated.
const lookupMatch: MatchLookup = async (name) => {
    try {
        return await matchIngredient(name);
    } catch (error) {
        console.error(`USDA match for "${name}" failed:`, error);

        return null;
    }
};

/*
 * Removes ingredients that match none of the requested ones. Only done when
 * every requested ingredient was returned (a dietary exclusion or a renamed
 * ingredient could otherwise be mistaken for an extra and lose a real one).
 */
export function withoutExtras<T extends { name: string }>(
    returned: T[],
    requested: { name: string }[],
): T[] {
    const pairs = pairWithInputs(
        returned.map((i) => i.name),
        requested.map((i) => i.name),
    );
    const covered = new Set(pairs.filter((p) => p !== undefined));
    if (covered.size < requested.length) return returned;

    const kept = returned.filter((_, index) => pairs[index] !== undefined);
    return kept.length > 0 ? kept : returned;
}

export async function generateMealWithOllama(
    input: GenerateMealRequest,
    lookup: MatchLookup = lookupMatch,
): Promise<GenerateMealResponse> {
    const apiKey = process.env.OLLAMA_API_KEY;
    const model = process.env.OLLAMA_MODEL;

    if (!apiKey) {
        throw new Error('OLLAMA_API_KEY is not configured');
    }

    if (!model) {
        throw new Error('OLLAMA_MODEL is not configured');
    }

    const ai = new OllamaAiClient(apiKey, model);

    // Cross-reference every ingredient with USDA before the model sees it.
    const enriched = await enrichIngredients(input.ingredients, lookup);
    const { systemPrompt, userPrompt } = buildMealPrompts({
        ...input,
        ingredients: enriched,
    });

    const response = await ai.generate(systemPrompt, userPrompt, 'json');

    let parsed: unknown;

    try {
        parsed = JSON.parse(response);
    } catch (error) {
        console.error('Invalid JSON returned by Ollama:', response);

        throw new Error('AI returned an invalid meal response', {
            cause: error,
        });
    }

    if (!isGenerateMealResponse(parsed)) {
        console.error('AI meal response failed validation:', response);

        throw new Error('AI returned an invalid meal response');
    }

    // Anything the model added beyond the cook's list is dropped.
    const authoritative = await reattachNutrition(
        withoutExtras(parsed.ingredients, enriched),
        enriched,
        lookup,
    );
    const ingredients = calibrateToRequirements(
        authoritative,
        input.requirements,
    );
    const estimatedIngredients = getEstimatedIngredients(ingredients);
    const considerations = getPrepConsiderations(
        namesForGuidance(
            ingredients.map(({ name }) => name),
            input.ingredients.map(({ name }) => name),
        ),
    );

    // Computed server-side; ignore anything the model put in these fields.
    const meal: GenerateMealResponse = { ...parsed };
    delete meal.estimatedIngredients;
    delete meal.considerations;

    return {
        ...meal,
        ingredients,
        servings: input.requirements.servings ?? 1,
        ...(estimatedIngredients.length > 0 && { estimatedIngredients }),
        considerations,
    };
}

export async function handleGenerateMealOllama(input: GenerateMealRequest) {
    const meal = await generateMealWithOllama(input);

    console.log('AI generated meal:', meal);

    return {
        status: 200,
        body: meal,
    };
}
