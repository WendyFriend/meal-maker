import { useEffect, useState } from 'react';
import {
    cachedNutritionLabFoods,
    foodSearchKey,
    searchNutritionLabFoods,
    type FoodSearchResult,
} from '../services/foodSearchService';

type SearchState = {
    key: string;
    foods: FoodSearchResult[];
    error?: boolean;
};

export function useNutritionLabFoodSearch(query: string, enabled: boolean) {
    const key = foodSearchKey(query);
    const [result, setResult] = useState<SearchState>();
    const [spinnerKey, setSpinnerKey] = useState('');

    useEffect(() => {
        if (!enabled || key.length < 2) return;
        const cached = cachedNutritionLabFoods(key);
        if (cached) return;

        const controller = new AbortController();
        const spinnerTimer = window.setTimeout(() => setSpinnerKey(key), 450);
        const timer = window.setTimeout(
            () => {
                void searchNutritionLabFoods(key, controller.signal)
                    .then((foods) => {
                        window.clearTimeout(spinnerTimer);
                        if (!controller.signal.aborted)
                            setResult({ key, foods });
                    })
                    .catch(() => {
                        window.clearTimeout(spinnerTimer);
                        if (!controller.signal.aborted)
                            setResult({ key, foods: [], error: true });
                    });
            },
            key.length === 2 ? 420 : 260,
        );

        return () => {
            window.clearTimeout(timer);
            window.clearTimeout(spinnerTimer);
            controller.abort();
        };
    }, [enabled, key]);

    const cached = key.length >= 2 ? cachedNutritionLabFoods(key) : undefined;
    const settled = cached ?? (result?.key === key ? result.foods : undefined);
    return {
        foods: enabled ? (settled ?? []) : [],
        loading: enabled && key.length >= 2 && !settled && spinnerKey === key,
        error: enabled && result?.key === key && Boolean(result.error),
    };
}
