import { describe, expect, it, vi } from 'vitest';
import {
    matchIngredient,
    matchIngredients,
    matchIngredientsRoute,
    normalizeQuery,
    scoreMatch,
    stripDescriptors,
    type MatchCache,
} from './matchIngredients.ts';
import type { USDAFood } from './usda/types.ts';

function food(
    description: string,
    fdcId = 1,
    dataType = 'SR Legacy',
): USDAFood {
    return {
        fdcId,
        dataType,
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

const noFoods = { foods: [] };

describe('normalizeQuery / stripDescriptors', () => {
    it('lower-cases and collapses whitespace', () => {
        expect(normalizeQuery('  Chicken   BREAST ')).toBe('chicken breast');
    });

    it('drops state words but never everything', () => {
        expect(stripDescriptors('Dried kidney beans')).toBe('kidney beans');
        expect(stripDescriptors('fresh')).toBe('fresh');
    });
});

describe('scoreMatch', () => {
    const rank = (query: string, descriptions: string[]) =>
        [...descriptions].sort(
            (a, b) => scoreMatch(food(b), query) - scoreMatch(food(a), query),
        );

    it('prefers raw whole foods over cooked, canned or processed ones', () => {
        expect(
            rank('spinach', [
                'Spinach, canned, regular pack, drained solids',
                'Spinach, cooked, boiled, drained, without salt',
                'Spinach souffle',
                'Spinach, raw',
            ])[0],
        ).toBe('Spinach, raw');
    });

    it('lets a named state win', () => {
        expect(
            rank('cooked spinach', [
                'Spinach, raw',
                'Spinach, cooked, boiled, drained, without salt',
            ])[0],
        ).toBe('Spinach, cooked, boiled, drained, without salt');
    });

    it('finds the food when the query is a later part of the description', () => {
        expect(
            rank('cheddar', [
                'Cheese, cheddar, sharp, sliced',
                'Cheese, cheddar',
                'LEAN POCKETS, Ham N Cheddar',
            ])[0],
        ).toBe('Cheese, cheddar');
    });

    it('penalises unusual variants unless typed', () => {
        expect(
            rank('milk', ['Milk, buttermilk, dried', 'Milk, whole, 3.25%'])[0],
        ).toBe('Milk, whole, 3.25%');
        expect(
            rank('dried milk', [
                'Milk, buttermilk, dried',
                'Milk, whole, 3.25%',
            ])[0],
        ).toBe('Milk, buttermilk, dried');
    });

    it('prefers SR Legacy over an otherwise equal Foundation entry', () => {
        expect(scoreMatch(food('Kale, raw', 1), 'kale')).toBeGreaterThan(
            scoreMatch(food('Kale, raw', 2, 'Foundation'), 'kale'),
        );
    });
});

describe('matchIngredient', () => {
    it('returns the best match, alternatives and high confidence', async () => {
        const search = respond([
            food('Spinach, canned, regular pack, drained solids', 1),
            food('Spinach souffle', 2),
            food('Spinach, raw', 3),
            food('Spinach, cooked, boiled, drained, without salt', 4),
        ]);
        const result = await matchIngredient('Spinach', search, new Map());

        expect(result.query).toBe('Spinach');
        expect(result.match).toMatchObject({
            description: 'Spinach, raw',
            source: 'usda',
            usda: { fdcId: 3, description: 'Spinach, raw' },
        });
        expect(result.alternatives).toHaveLength(3);
        expect(result.alternatives.map((a) => a.description)).not.toContain(
            'Spinach, raw',
        );
        expect(result.confidence).toBe('high');
    });

    it('caps alternatives at five', async () => {
        const foods = Array.from({ length: 12 }, (_, i) =>
            food(`Bean variety${i}, raw`, i),
        );
        const result = await matchIngredient('bean', respond(foods), new Map());

        expect(result.alternatives).toHaveLength(5);
    });

    it('retries without requireAllWords, then reports nothing found', async () => {
        const search = vi
            .fn()
            .mockResolvedValueOnce(noFoods)
            .mockResolvedValueOnce({ foods: [food('Mystery stew, raw')] });
        const result = await matchIngredient('mystery', search, new Map());

        expect(
            search.mock.calls.map(([params]) => params.requireAllWords),
        ).toEqual([true, false]);
        expect(result.match?.description).toBe('Mystery stew, raw');

        const none = await matchIngredient('zzzz', respond([]), new Map());
        expect(none).toMatchObject({
            match: null,
            alternatives: [],
            confidence: 'low',
        });
    });

    it('retries with descriptors removed before relaxing the search', async () => {
        const search = vi
            .fn()
            .mockResolvedValueOnce(noFoods)
            .mockResolvedValueOnce({
                foods: [food('Beans, kidney, red, mature seeds, raw')],
            });
        const result = await matchIngredient(
            'dried kidney beans',
            search,
            new Map(),
        );

        expect(search.mock.calls.map(([params]) => params.query)).toEqual([
            'dried kidney beans',
            'kidney beans',
        ]);
        expect(result.confidence).toBe('high');
    });

    it('marks a match that misses a typed word as low confidence', async () => {
        const result = await matchIngredient(
            'dragon fruit',
            respond([food('Fruit salad, canned')]),
            new Map(),
        );

        expect(result.confidence).toBe('low');
    });

    it('uses an alias search for bare staples', async () => {
        const search = respond([
            food('Rice, black, unenriched, raw', 1),
            food('Rice, white, long-grain, regular, raw, enriched', 2),
        ]);
        await matchIngredient('rice', search, new Map());

        expect(search.mock.calls[0][0].query).toBe('rice white long-grain raw');
    });

    it('caches by normalised query and expires entries', async () => {
        const search = respond([food('Banana, raw')]);
        const cache: MatchCache = new Map();
        const start = 1_000_000;

        await matchIngredient('Banana', search, cache, start);
        const again = await matchIngredient(
            '  banana ',
            search,
            cache,
            start + 60_000,
        );

        expect(search).toHaveBeenCalledTimes(1);
        // The cached result is reported under the name as typed this time.
        expect(again.query).toBe('  banana ');

        await matchIngredient(
            'banana',
            search,
            cache,
            start + 25 * 60 * 60 * 1000,
        );
        expect(search).toHaveBeenCalledTimes(2);
    });

    it('keeps the cache bounded', async () => {
        const search = respond([food('Thing, raw')]);
        const cache: MatchCache = new Map();

        for (let i = 0; i < 520; i++) {
            await matchIngredient(`thing ${i}`, search, cache);
        }

        expect(cache.size).toBeLessThanOrEqual(500);
    });

    it('retries a failed USDA call before giving up', async () => {
        const search = vi
            .fn()
            .mockRejectedValueOnce(new Error('503'))
            .mockResolvedValueOnce({ foods: [food('Banana, raw')] });
        const result = await matchIngredient('banana', search, new Map());

        expect(result.match?.description).toBe('Banana, raw');
    });
});

describe('matchIngredients', () => {
    it('looks names up in parallel, in order', async () => {
        const search = vi.fn(async ({ query }: { query: string }) => ({
            foods: [food(`${query}, raw`)],
        }));
        const matches = await matchIngredients(
            ['kale', 'leek'],
            search as never,
            new Map(),
        );

        expect(matches.map((m) => m.query)).toEqual(['kale', 'leek']);
        expect(search).toHaveBeenCalledTimes(2);
    });
});

describe('matchIngredientsRoute', () => {
    it.each([
        undefined,
        null,
        'spinach',
        {},
        { names: 'spinach' },
        { names: ['spinach', 3] },
    ])('rejects a bad body: %j', async (body) => {
        const search = respond([]);
        const result = await matchIngredientsRoute(body, search, new Map());

        expect(result.status).toBe(400);
        expect(result.body).toMatchObject({
            error: { code: 'INVALID_REQUEST' },
        });
        expect(search).not.toHaveBeenCalled();
    });

    it('ignores blanks and caps the list at 20 names', async () => {
        const search = vi.fn(async ({ query }: { query: string }) => ({
            foods: [food(`${query}, raw`)],
        }));
        const names = [
            '',
            '   ',
            ...Array.from({ length: 30 }, (_, i) => `item${i}`),
        ];
        const result = await matchIngredientsRoute(
            { names },
            search as never,
            new Map(),
        );

        expect(result.status).toBe(200);
        if (result.status !== 200) return;
        expect(result.body.matches).toHaveLength(20);
        expect(result.body.matches[0].query).toBe('item0');
    });

    it('returns an empty list for no names', async () => {
        const result = await matchIngredientsRoute(
            { names: [] },
            respond([]),
            new Map(),
        );

        expect(result).toEqual({ status: 200, body: { matches: [] } });
    });

    it('returns 502 when USDA fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await matchIngredientsRoute(
            { names: ['spinach'] },
            vi.fn().mockRejectedValue(new Error('boom')),
            new Map(),
        );

        expect(result.status).toBe(502);
        expect(result.body).toMatchObject({
            error: { code: 'NUTRITION_LOOKUP_FAILED' },
        });
    });
});
