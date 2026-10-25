import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    cleanFoodName,
    scoreFood,
    searchNutrition,
} from './searchNutrition.ts';
import { mapUSDAFoodToIngredientNutrition } from './usda/mapper.ts';
import type { USDAFood } from './usda/types.ts';

function food(description: string, fdcId = 1): USDAFood {
    return {
        fdcId,
        dataType: 'SR Legacy',
        description,
        foodNutrients: [
            {
                nutrientNumber: '208',
                nutrientName: 'Energy',
                value: 100,
                unitName: 'KCAL',
            },
        ],
    };
}

function respond(foods: USDAFood[]) {
    return vi.fn().mockResolvedValue({
        foodSearchCriteria: { query: 'x' },
        totalHits: foods.length,
        currentPage: 1,
        totalPages: 1,
        foods,
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('cleanFoodName', () => {
    it('shortens USDA descriptions', () => {
        expect(cleanFoodName('Chicken, broilers or fryers, breast, raw')).toBe(
            'Chicken, breast',
        );
        expect(cleanFoodName('RICE, white, long-grain, raw')).toBe(
            'Rice, white, long-grain',
        );
        expect(
            cleanFoodName('Beef, ground, 85% lean meat / 15% fat, raw'),
        ).toBe('Beef, ground');
    });
});

describe('searchNutrition', () => {
    it('returns empty results for short queries without searching', async () => {
        const search = respond([]);
        expect(await searchNutrition(' a ', search)).toEqual({
            status: 200,
            body: { results: [] },
        });
        expect(await searchNutrition(undefined, search)).toEqual({
            status: 200,
            body: { results: [] },
        });
        expect(search).not.toHaveBeenCalled();
    });

    it('dedupes case-insensitively and limits to 8', async () => {
        const foods = [
            food('Apple, raw', 1),
            food('APPLE, raw', 2),
            ...Array.from({ length: 12 }, (_, i) =>
                food(`Food${i} stuff, x`, i + 10),
            ),
        ];
        const result = await searchNutrition('apple', respond(foods));
        expect(result.status).toBe(200);
        if (result.status !== 200) return;
        const names = result.body.results.map((r) => r.name.toLowerCase());
        expect(result.body.results).toHaveLength(8);
        expect(new Set(names).size).toBe(8);
        expect(result.body.results[0]).toMatchObject({
            source: 'usda',
            description: 'Apple, raw',
            caloriesPer100g: 100,
        });
    });

    it('returns 502 when the lookup throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await searchNutrition(
            'apple',
            vi.fn().mockRejectedValue(new Error('boom')),
        );
        expect(result.status).toBe(502);
        expect(result.body).toMatchObject({
            error: { code: 'NUTRITION_LOOKUP_FAILED' },
        });
    });

    it('returns 502 when USDA responds with an error (mocked fetch)', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubEnv('USDA_API_KEY', 'test-key');
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Server Error',
            }),
        );
        vi.resetModules();
        const { searchNutrition: fresh } = await import('./searchNutrition.ts');
        const result = await fresh('apple');
        expect(result.status).toBe(502);
    });
});

describe('scoreFood', () => {
    it('prefers the plain ingredient over processed or imitation foods', () => {
        const ranked = [
            'Chicken, meatless',
            'Babyfood, dinner, chicken noodle',
            'Chicken, broilers or fryers, breast, meat only, raw',
            'Frankfurter, chicken',
        ].sort((a, b) => scoreFood(b, 'chicken') - scoreFood(a, 'chicken'));

        expect(ranked[0]).toBe(
            'Chicken, broilers or fryers, breast, meat only, raw',
        );
    });
});

describe('mapUSDAFoodToIngredientNutrition', () => {
    it('falls back to Atwater energy, then to energy from macros', () => {
        const atwater = mapUSDAFoodToIngredientNutrition({
            ...food('Rice, brown'),
            foodNutrients: [
                { nutrientNumber: '958', value: 367 },
                { nutrientNumber: '205.2', value: 76 },
            ],
        } as USDAFood);
        expect(atwater.caloriesPer100g).toBe(367);
        expect(atwater.carbohydratePer100g).toBe(76);

        const macrosOnly = mapUSDAFoodToIngredientNutrition({
            ...food('Oil, olive'),
            foodNutrients: [{ nutrientNumber: '298', value: 93 }],
        } as USDAFood);
        expect(macrosOnly.fatPer100g).toBe(93);
        expect(macrosOnly.caloriesPer100g).toBe(837);
    });
});
