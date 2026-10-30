import type { IngredientNutrition } from '../../shared/types/types.ts';
import { searchFoods } from './usda/client.js';
import { mapUSDAFoodToIngredientNutrition } from './usda/mapper.js';
import {
    getUSDAQuery,
    matchesFoodDescription,
    selectUSDAFood,
} from './usda/selectFood.js';
import { getFoodDetail, resolveFood } from './mealmaker/client.js';
import { mapMealMakerFoodToIngredientNutrition } from './mealmaker/mapper.js';

async function lookupWithMealMakerApi(
    name: string,
): Promise<IngredientNutrition> {
    const food = await resolveFood(getUSDAQuery(name));
    // Synonym hits (capsicum -> peppers) fail the token check and can be tiered ambiguous.
    if (
        !food ||
        (food.match.tier !== 'confident' &&
            food.match.tier !== 'probable' &&
            !food.match.matchedVia?.startsWith('synonym:') &&
            !matchesFoodDescription(name, food.description))
    ) {
        throw new Error(`No matching food found for ingredient: "${name}"`);
    }
    // Micronutrients only come with the detail record; macros still work without it.
    const detail = await getFoodDetail(food.fdcId).catch((error) => {
        console.warn(`Food detail unavailable for "${name}":`, error);
        return undefined;
    });
    return mapMealMakerFoodToIngredientNutrition(food, detail);
}

async function lookupWithUsda(name: string): Promise<IngredientNutrition> {
    const response = await searchFoods({
        query: getUSDAQuery(name),
        pageSize: 50,
    });
    const food = selectUSDAFood(name, response.foods);
    if (!food) {
        throw new Error(
            `No matching USDA food found for ingredient: "${name}"`,
        );
    }
    return mapUSDAFoodToIngredientNutrition(food);
}

export function lookupFoodNutrition(
    name: string,
    provider: 'usda' | 'nutrition-lab' = 'usda',
): Promise<IngredientNutrition> {
    return provider === 'nutrition-lab'
        ? lookupWithMealMakerApi(name)
        : lookupWithUsda(name);
}
