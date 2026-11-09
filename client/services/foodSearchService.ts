import type { IngredientInfo } from '../../shared/types/types';

export type FoodSearchResult = {
    fdcId: number;
    name: string;
    description: string;
    per100g: {
        kcal: number | null;
        proteinG: number | null;
        carbsG: number | null;
        fatG: number | null;
        sugarG?: number | null;
        satFatG?: number | null;
        fibreG?: number | null;
        calciumMg?: number | null;
        ironMg?: number | null;
        vitaminCMg?: number | null;
    };
};

const SEARCH_CACHE_MS = 5 * 60_000;
const SEARCH_CACHE_LIMIT = 40;
const searchCache = new Map<
    string,
    { foods: FoodSearchResult[]; savedAt: number }
>();

export function foodSearchKey(query: string): string {
    return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cachedNutritionLabFoods(
    query: string,
): FoodSearchResult[] | undefined {
    const key = foodSearchKey(query);
    const entry = searchCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.savedAt >= SEARCH_CACHE_MS) {
        searchCache.delete(key);
        return undefined;
    }
    searchCache.delete(key);
    searchCache.set(key, entry);
    return entry.foods;
}

export async function searchNutritionLabFoods(
    query: string,
    signal?: AbortSignal,
): Promise<FoodSearchResult[]> {
    const key = foodSearchKey(query);
    const cached = cachedNutritionLabFoods(key);
    if (cached) return cached;
    const response = await fetch(
        `/api/food-search?q=${encodeURIComponent(key)}`,
        {
            signal,
        },
    );
    if (!response.ok) throw new Error('Food search failed');
    const data = (await response.json()) as { results: FoodSearchResult[] };
    if (!signal?.aborted) {
        searchCache.set(key, { foods: data.results, savedAt: Date.now() });
        if (searchCache.size > SEARCH_CACHE_LIMIT)
            searchCache.delete(searchCache.keys().next().value!);
    }
    return data.results;
}

function known(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function ingredientFromFoodSearch(
    food: FoodSearchResult,
): IngredientInfo {
    const {
        kcal,
        proteinG,
        carbsG,
        fatG,
        sugarG,
        satFatG,
        fibreG,
        calciumMg,
        ironMg,
        vitaminCMg,
    } = food.per100g;
    if (!known(kcal) || !known(proteinG) || !known(carbsG) || !known(fatG))
        throw new Error(
            'This food is missing nutrition data and cannot be saved.',
        );
    return {
        name: food.name,
        nutritionSource: { fdcId: food.fdcId, description: food.description },
        caloriesPer100g: kcal,
        proteinPer100g: proteinG,
        carbohydratePer100g: carbsG,
        fatPer100g: fatG,
        ...(known(sugarG) ? { sugarPer100g: sugarG } : {}),
        ...(known(satFatG) ? { saturatedFatPer100g: satFatG } : {}),
        ...(known(fibreG) ? { fiberPer100g: fibreG } : {}),
        ...(known(calciumMg) ? { calciumPer100g: calciumMg } : {}),
        ...(known(ironMg) ? { ironPer100g: ironMg } : {}),
        ...(known(vitaminCMg) ? { vitaminCPer100g: vitaminCMg } : {}),
    };
}
