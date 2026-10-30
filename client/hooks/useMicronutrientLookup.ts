import { useEffect, useState } from 'react';
import type { IngredientInfo } from '../../shared/types/types';
import type { MicronutrientValues } from '../../shared/micronutrients';
import { loadMealGenerator } from '../settings/mealGenerator';
import {
    getIngredientMicronutrients,
    micronutrientLookupKey,
    needsMicronutrients,
} from '../services/micronutrientService';

export function useMicronutrientLookup(ingredients: IngredientInfo[]) {
    const generator = loadMealGenerator();
    const names = JSON.stringify(
        [
            ...new Set(
                ingredients
                    .filter(
                        (ingredient) =>
                            ingredient.name.trim() &&
                            needsMicronutrients(ingredient),
                    )
                    .map(({ name }) => micronutrientLookupKey(name)),
            ),
        ].sort(),
    );
    const [attempt, setAttempt] = useState(0);
    const requestKey = `${generator}:${attempt}:${names}`;
    const [result, setResult] = useState<{
        key: string;
        data: Record<string, MicronutrientValues>;
        failed: string[];
    } | null>(null);

    useEffect(() => {
        const requested: string[] = JSON.parse(names);
        if (!requested.length) return;
        let active = true;
        Promise.allSettled(requested.map(getIngredientMicronutrients)).then(
            (responses) => {
                if (!active) return;
                const data: Record<string, MicronutrientValues> = {};
                const failed: string[] = [];
                responses.forEach((response, index) => {
                    if (response.status === 'fulfilled')
                        data[requested[index]] = response.value;
                    else failed.push(requested[index]);
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
        data: current?.data ?? {},
        loading: names !== '[]' && !current,
        failed: current?.failed ?? [],
        retry: () => setAttempt((value) => value + 1),
    };
}
