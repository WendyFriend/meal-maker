import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MEAL_SLOTS,
    DEFAULT_TARGETS,
    type MealSlotConfig,
} from '../../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import {
    fitsBudget,
    getFocusNutrients,
    getNutrientProgress,
    getRecipeNutrition,
    getSlotBudget,
    inferMealType,
    sortSlots,
    sumDayMicronutrients,
    sumNutrition,
    type PlannedMeal,
} from './budget';

function makeRecipe(
    id: string,
    calories: number,
    proteinG = 0,
    extra: Partial<Recipe['ingredients'][number]> = {},
): Recipe {
    // One 100 g ingredient, so the per-100 g values are the serving's.
    return {
        id,
        userId: 'u',
        recipeName: id,
        instructions: [],
        ingredients: [
            {
                name: id,
                weight: 100,
                caloriesPer100g: calories,
                proteinPer100g: proteinG,
                carbohydratePer100g: 0,
                fatPer100g: 0,
                ...extra,
            },
        ],
    };
}

function planned(slot: string, recipe: Recipe, servings = 1): PlannedMeal {
    const entry: MealPlanEntry = {
        id: `${slot}-${recipe.id}`,
        planDate: '2026-10-25',
        slot,
        recipeId: recipe.id as string,
        servings,
    };

    return { entry, recipe };
}

const slots = DEFAULT_MEAL_SLOTS;
const lunch = slots[1];

describe('nutrition totals', () => {
    it('scales entries by the portions eaten', () => {
        const recipe = makeRecipe('a', 400, 30, { fiberPer100g: 5 });

        expect(getRecipeNutrition(recipe)).toMatchObject({
            calories: 400,
            proteinG: 30,
            fiberG: 5,
        });
        expect(sumNutrition([planned('lunch', recipe, 1.5)])).toMatchObject({
            calories: 600,
            proteinG: 45,
            fiberG: 7.5,
        });
    });

    it('scales micronutrients by weight and portions', () => {
        const recipe = makeRecipe('a', 100, 0, {
            micronutrientsPer100g: { vitaminC: 20 },
        });

        expect(sumDayMicronutrients([planned('lunch', recipe, 2)])).toEqual({
            vitaminC: 40,
        });
    });
});

describe('getSlotBudget', () => {
    const base = { targets: DEFAULT_TARGETS, slots };

    it('splits the whole day by share on an empty day', () => {
        // 2000 kcal * 30 / 100 shares
        const budget = getSlotBudget({ ...base, slot: lunch, meals: [] });

        expect(budget.calories).toBe(600);
        expect(budget.mealType).toBe('lunch');
        expect(budget.plannedCalories).toBe(0);
    });

    it('splits what is left between the periods still empty', () => {
        // Breakfast 600 kcal logged: 1400 left, lunch 30 of 75 shares left.
        const meals = [planned('breakfast', makeRecipe('oats', 600, 30))];
        const budget = getSlotBudget({ ...base, slot: lunch, meals });

        expect(budget.calories).toBe(560);
        expect(budget.remaining.calories).toBe(1400);
    });

    it('gives the last empty period everything that is left', () => {
        const dinner = slots[3];
        const meals = [
            planned('breakfast', makeRecipe('a', 500)),
            planned('lunch', makeRecipe('b', 600)),
            planned('snack', makeRecipe('c', 200)),
        ];

        expect(getSlotBudget({ ...base, slot: dinner, meals }).calories).toBe(
            700,
        );
    });

    it('uses the share minus what is already in a period', () => {
        const meals = [planned('lunch', makeRecipe('soup', 250))];
        const budget = getSlotBudget({ ...base, slot: lunch, meals });

        expect(budget.calories).toBe(350);
        expect(budget.plannedCalories).toBe(250);
    });

    it('clamps to a sensible range', () => {
        const full = [planned('breakfast', makeRecipe('big', 2500))];
        const dinner = slots[3];

        expect(
            getSlotBudget({ ...base, slot: dinner, meals: full }).calories,
        ).toBe(150);
        expect(
            getSlotBudget({
                targets: { ...DEFAULT_TARGETS, calories: 8000 },
                slots: [{ ...lunch, calorieShare: 100 }],
                slot: { ...lunch, calorieShare: 100 },
                meals: [],
            }).calories,
        ).toBe(1500);
    });

    it('splits evenly when no period has a share', () => {
        const flat = slots.map((slot) => ({ ...slot, calorieShare: 0 }));
        const budget = getSlotBudget({
            targets: DEFAULT_TARGETS,
            slots: flat,
            slot: flat[0],
            meals: [],
        });

        expect(budget.calories).toBe(500);
    });

    it('derives protein % from the remaining protein and calories', () => {
        // Targets: 120 g protein = 480 of 2000 kcal = 24%.
        const empty = getSlotBudget({ ...base, slot: lunch, meals: [] });

        expect(empty.proteinPercentage).toBe(24);
        expect(empty.proteinG).toBe(36);

        // 60 g protein in 400 kcal: 60 g / 1600 kcal left = 15%.
        const meals = [planned('breakfast', makeRecipe('a', 400, 60))];
        const later = getSlotBudget({ ...base, slot: lunch, meals });

        expect(later.proteinPercentage).toBe(15);
    });

    it('clamps protein % and falls back to the targets once the day is full', () => {
        const lowProtein = [planned('breakfast', makeRecipe('a', 100, 119))];
        const high = getSlotBudget({
            ...base,
            slot: lunch,
            meals: lowProtein,
        });

        expect(high.proteinPercentage).toBe(10);

        const veryHigh = getSlotBudget({
            targets: { ...DEFAULT_TARGETS, proteinG: 400 },
            slots,
            slot: lunch,
            meals: [],
        });

        expect(veryHigh.proteinPercentage).toBe(60);

        const over = [planned('breakfast', makeRecipe('a', 2400, 0))];

        expect(
            getSlotBudget({ ...base, slot: lunch, meals: over })
                .proteinPercentage,
        ).toBe(24);
    });

    it('keeps macro budgets consistent with the calories', () => {
        const { calories, proteinG, carbsG, fatG } = getSlotBudget({
            ...base,
            slot: lunch,
            meals: [],
        });

        expect(proteinG * 4 + carbsG * 4 + fatG * 9).toBeGreaterThan(
            calories * 0.95,
        );
        expect(proteinG * 4 + carbsG * 4 + fatG * 9).toBeLessThan(
            calories * 1.05,
        );
    });
});

describe('inferMealType', () => {
    const custom = (time?: string, label = 'Meal'): MealSlotConfig => ({
        id: 'custom-1',
        label,
        time,
        calorieShare: 10,
    });

    it('uses the id for the standard periods', () => {
        expect(inferMealType({ ...lunch, time: '08:00' })).toBe('lunch');
    });

    it('infers from the time of day', () => {
        expect(inferMealType(custom('06:00'))).toBe('breakfast');
        expect(inferMealType(custom('10:29'))).toBe('breakfast');
        expect(inferMealType(custom('10:30'))).toBe('lunch');
        expect(inferMealType(custom('14:29'))).toBe('lunch');
        expect(inferMealType(custom('14:30'))).toBe('snack');
        expect(inferMealType(custom('16:59'))).toBe('snack');
        expect(inferMealType(custom('17:00'))).toBe('dinner');
        expect(inferMealType(custom('22:15'))).toBe('dinner');
    });

    it('falls back to the label, then snack, without a time', () => {
        expect(inferMealType(custom(undefined, 'Second Breakfast'))).toBe(
            'breakfast',
        );
        expect(inferMealType(custom(undefined, 'Grazing'))).toBe('snack');
    });
});

describe('sortSlots', () => {
    it('orders by time with untimed periods last', () => {
        const sorted = sortSlots([
            { id: 'a', label: 'A', calorieShare: 10 },
            { id: 'b', label: 'B', time: '18:00', calorieShare: 10 },
            { id: 'c', label: 'C', time: '07:00', calorieShare: 10 },
        ]);

        expect(sorted.map((slot) => slot.id)).toEqual(['c', 'b', 'a']);
    });
});

describe('focus nutrients', () => {
    it('always considers fibre, even on an empty day', () => {
        expect(
            getFocusNutrients({ targets: DEFAULT_TARGETS, meals: [] }),
        ).toEqual(['Fibre']);
    });

    it('drops fibre once the target is met', () => {
        const meals = [
            planned('lunch', makeRecipe('a', 300, 0, { fiberPer100g: 31 })),
        ];

        expect(
            getFocusNutrients({ targets: DEFAULT_TARGETS, meals }),
        ).not.toContain('Fibre');
    });

    it('lists the lowest nutrients first once data is available', () => {
        const meals = [
            planned(
                'lunch',
                makeRecipe('a', 300, 0, {
                    fiberPer100g: 30,
                    micronutrientsPer100g: {
                        vitaminC: 90, // 100% DV
                        calcium: 650, // 50% DV
                        iron: 4.5, // 25% DV
                        sodium: 10, // a limit; never a focus
                    },
                }),
            ),
        ];
        const focus = getFocusNutrients({
            targets: DEFAULT_TARGETS,
            meals,
            max: 2,
        });

        // Lowest first; Vitamin C is met, Sodium is a limit, and nutrients
        // no ingredient reports are unknown rather than empty.
        expect(focus).toEqual(['Iron', 'Calcium']);

        const all = getFocusNutrients({ targets: DEFAULT_TARGETS, meals });

        expect(all.length).toBeLessThanOrEqual(4);
    });

    it('measures fibre against the user target', () => {
        const progress = getNutrientProgress(
            { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 15 },
            {},
            DEFAULT_TARGETS,
        );

        expect(progress.find((item) => item.key === 'fiber')?.percent).toBe(50);
    });
});

describe('fitsBudget', () => {
    it('allows up to 10% over the budget', () => {
        expect(fitsBudget(660, 600)).toBe(true);
        expect(fitsBudget(661, 600)).toBe(false);
    });
});
