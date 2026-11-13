import { useEffect, useState } from 'react';
import type { UserIngredient } from '../../shared/types/types';
import { getIngredientNutrition } from '../services/micronutrientService';
import { loadMealGenerator } from '../settings/mealGenerator';
import { normalizeIngredientName } from '../utils/Ingredient';

/** Resolve thumbnail IDs for records saved before nutrition_source existed. */
export default function useSavedIngredientFoodIds(
    ingredients: UserIngredient[],
    enabled = true,
) {
    const [legacyFoodIds, setLegacyFoodIds] = useState<Record<string, number>>(
        {},
    );

    useEffect(() => {
        if (!enabled || loadMealGenerator() !== 'nutrition-lab') return;
        const missing = ingredients.filter(
            (ingredient) => !ingredient.nutritionSource?.fdcId,
        );
        if (!missing.length) return;
        let cancelled = false;
        let next = 0;

        async function resolveMissingFoodIds() {
            while (!cancelled && next < missing.length) {
                const ingredient = missing[next++];
                try {
                    const match = await getIngredientNutrition(ingredient.name);
                    const fdcId = match.nutritionSource?.fdcId;
                    if (!cancelled && fdcId) {
                        setLegacyFoodIds((current) => ({
                            ...current,
                            [normalizeIngredientName(ingredient.name)]: fdcId,
                        }));
                    }
                } catch {
                    // Keep the local thumbnail if a historical food cannot be matched.
                }
            }
        }

        void Promise.all(
            Array.from({ length: Math.min(3, missing.length) }, () =>
                resolveMissingFoodIds(),
            ),
        );
        return () => {
            cancelled = true;
        };
    }, [ingredients, enabled]);

    return legacyFoodIds;
}
