import { useEffect, useState } from 'react';
import type { IngredientInfo } from '../../shared/types/types';
import { loadMealGenerator } from '../settings/mealGenerator';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
    micronutrientLookupKey,
    needsMicronutrients,
} from '../services/micronutrientService';

export function useMicronutrientLookup(
    ingredients: IngredientInfo[],
    options: { includeFoodSource?: boolean } = {},
) {
    const generator = loadMealGenerator();
    const names = JSON.stringify(
        [
            ...new Set(
                ingredients
                    .filter(
                        (ingredient) =>
                            ingredient.name.trim() &&
                            (needsMicronutrients(ingredient) ||
                                (options.includeFoodSource &&
                                    !ingredient.nutritionSource)),
                    )
                    .map(({ name }) => micronutrientLookupKey(name)),
            ),
        ].sort(),
    );
    const [attempt, setAttempt] = useState(0);
    const requestKey = `${generator}:${attempt}:${names}`;
    const requested: string[] = JSON.parse(names);
    const cachedData: Record<string, IngredientInfo> = {};
    for (const name of requested) {
        const cached = getCachedIngredientNutrition(name);
        if (cached) cachedData[name] = cached;
    }
    const missingNames = requested.filter((name) => !cachedData[name]);
    const [result, setResult] = useState<{
        key: string;
        data: Record<string, IngredientInfo>;
        failed: string[];
    } | null>(null);

    useEffect(() => {
        const requested: string[] = JSON.parse(names);
        const missing = requested.filter(
            (name) => !getCachedIngredientNutrition(name),
        );
        if (!missing.length) return;
        let active = true;
        Promise.allSettled(missing.map(getIngredientNutrition)).then(
            (responses) => {
                if (!active) return;
                const data: Record<string, IngredientInfo> = {};
                const failed: string[] = [];
                responses.forEach((response, index) => {
                    if (response.status === 'fulfilled')
                        data[missing[index]] = response.value;
                    else failed.push(missing[index]);
                });
                setResult({ key: requestKey, data, failed });
            },
        );
        return () => {
            active = false;
        };
    }, [names, requestKey]);

    const current = result?.key === requestKey ? result : null;
    return {
        data: { ...cachedData, ...current?.data },
        loading: missingNames.length > 0 && !current,
        failed: current?.failed ?? [],
        retry: () => setAttempt((value) => value + 1),
    };
}
