import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateMealRequest } from '../../../shared/types/types.ts';
import type { MatchLookup } from '../authoritativeNutrition.ts';
import { getMealTotals } from '../calibrateMeal.ts';
import {
    buildMealPrompts,
    generateMealWithOllama,
} from './generateMealOllama.ts';

function build(requirements: GenerateMealRequest['requirements']) {
    return buildMealPrompts({
        ingredients: [{ name: 'chicken' }],
        requirements,
    });
}

describe('buildMealPrompts preparation guidance', () => {
    it('puts required steps for the ingredients in the prompt', () => {
        const { systemPrompt } = buildMealPrompts({
            ingredients: [{ name: 'dried kidney beans' }, { name: 'spinach' }],
            requirements: {},
        });

        expect(systemPrompt).toContain('REQUIRED');
        expect(systemPrompt).toContain('dried kidney beans');
        expect(systemPrompt).toContain('Boil hard');
        expect(systemPrompt).toContain('spinach');
        expect(systemPrompt).toContain('oxalate');
    });

    it('omits the ingredient guidance when nothing applies', () => {
        const { systemPrompt } = buildMealPrompts({
            ingredients: [{ name: 'banana' }],
            requirements: {},
        });

        expect(systemPrompt).not.toContain('REQUIRED guidance below');
        expect(systemPrompt).toContain('blanch or boil high-oxalate greens');
    });

    it('lets the model add a few pantry staples', () => {
        expect(build({}).systemPrompt).toContain('up to 3 pantry staples');
    });

    it('sends authoritative macros and fibre but not micronutrients', () => {
        const { userPrompt, systemPrompt } = buildMealPrompts({
            ingredients: [
                {
                    name: 'Spinach',
                    caloriesPer100g: 23,
                    proteinPer100g: 2.9,
                    carbohydratePer100g: 3.6,
                    fatPer100g: 0.4,
                    fiberPer100g: 2.2,
                    micronutrientsPer100g: { iron: 2.7 },
                    nutritionSource: 'usda',
                } as GenerateMealRequest['ingredients'][number],
            ],
            requirements: {},
        });
        const [spinach] = JSON.parse(userPrompt).ingredients;

        expect(spinach).toMatchObject({
            fiberPer100g: 2.2,
            nutritionSource: 'usda',
        });
        expect(spinach).not.toHaveProperty('micronutrientsPer100g');
        expect(systemPrompt).toContain('nutritionSource');
    });
});

describe('buildMealPrompts dayContext', () => {
    const dayContext = {
        slotLabel: 'lunch',
        dailyTargets: {
            calories: 2000,
            proteinG: 120,
            carbsG: 220,
            fatG: 65,
            fiberG: 30,
        },
        plannedSoFar: {
            calories: 700,
            proteinG: 40,
            carbsG: 80,
            fatG: 25,
            fiberG: 6,
        },
        focusNutrients: ['Fibre', 'Vitamin C'],
    };

    it('describes the meal slot, targets, plan so far and focus', () => {
        const { systemPrompt } = build({ calories: 500, dayContext });

        expect(systemPrompt).toContain('the lunch of a planned day');
        expect(systemPrompt).toContain('2000 kcal');
        expect(systemPrompt).toContain('700 kcal');
        expect(systemPrompt).toContain('24 g fibre still to come');
        expect(systemPrompt).toContain('Fibre, Vitamin C');
    });

    it('is absent without a day context', () => {
        expect(build({ calories: 500 }).systemPrompt).not.toContain(
            'planned day',
        );
    });
});

describe('generateMealWithOllama', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const foods: Record<string, object> = {
        'dried kidney beans': {
            name: 'Beans, kidney',
            caloriesPer100g: 337,
            proteinPer100g: 23,
            carbohydratePer100g: 61,
            fatPer100g: 1.1,
            fiberPer100g: 15,
            micronutrientsPer100g: { iron: 8.2 },
            usda: { fdcId: 1, description: 'Beans, kidney, red, raw' },
        },
        'olive oil': {
            name: 'Oil, olive',
            caloriesPer100g: 884,
            proteinPer100g: 0,
            carbohydratePer100g: 0,
            fatPer100g: 100,
            micronutrientsPer100g: { vitaminE: 14 },
            usda: { fdcId: 2, description: 'Oil, olive' },
        },
    };

    // A fake USDA: knows only the foods above.
    const lookup: MatchLookup = async (name) => {
        const food = foods[name.toLowerCase()];

        return {
            query: name,
            match: food
                ? ({ ...food, source: 'usda', description: 'x' } as never)
                : null,
            alternatives: [],
            confidence: food ? 'high' : 'low',
        };
    };

    function stubOllama(meal: object) {
        vi.stubEnv('OLLAMA_API_KEY', 'key');
        vi.stubEnv('OLLAMA_MODEL', 'model');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: JSON.stringify(meal) } }],
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        return fetchMock;
    }

    it('re-attaches USDA data, calibrates and attaches considerations', async () => {
        const fetchMock = stubOllama({
            mealName: 'Bean stew',
            ingredients: [
                {
                    name: 'Kidney beans, soaked',
                    weight: 100,
                    // Wrong numbers the model must not be able to keep.
                    caloriesPer100g: 50,
                    proteinPer100g: 1,
                    carbohydratePer100g: 1,
                    fatPer100g: 1,
                },
                {
                    name: 'Olive oil',
                    weight: 10,
                    caloriesPer100g: 1,
                    proteinPer100g: 0,
                    carbohydratePer100g: 0,
                    fatPer100g: 1,
                },
                {
                    name: 'Smoked paprika',
                    weight: 2,
                    caloriesPer100g: 282,
                    proteinPer100g: 14,
                    carbohydratePer100g: 54,
                    fatPer100g: 13,
                },
            ],
            instructions: ['Soak, boil hard, simmer.'],
        });

        const meal = await generateMealWithOllama(
            {
                ingredients: [{ name: 'dried kidney beans' }],
                requirements: { calories: 600 },
            },
            lookup,
        );

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.messages[0].content).toContain('REQUIRED');
        expect(
            JSON.parse(body.messages[1].content).ingredients[0],
        ).toMatchObject({ caloriesPer100g: 337, nutritionSource: 'usda' });

        const [beans, oil, paprika] = meal.ingredients;
        expect(beans).toMatchObject({
            caloriesPer100g: 337,
            proteinPer100g: 23,
            micronutrientsPer100g: { iron: 8.2 },
            usda: { fdcId: 1 },
            nutritionSource: 'usda',
        });
        expect(oil).toMatchObject({
            caloriesPer100g: 884,
            nutritionSource: 'usda',
        });
        expect(paprika.nutritionSource).toBe('estimated');
        expect(meal.estimatedIngredients).toEqual(['Smoked paprika']);

        const { calories } = getMealTotals(meal.ingredients);
        expect(Math.abs(calories - 600)).toBeLessThanOrEqual(600 * 0.02);
        expect(meal.considerations?.map((c) => c.id)).toContain('kidney-beans');
        expect(meal.servings).toBe(1);
    });

    it('rejects an invalid model response', async () => {
        stubOllama({ nope: true });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            generateMealWithOllama(
                { ingredients: [{ name: 'banana' }], requirements: {} },
                lookup,
            ),
        ).rejects.toThrow('invalid meal response');
    });
});
