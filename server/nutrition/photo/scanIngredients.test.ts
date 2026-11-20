// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { handleScanIngredients } from './scanIngredients.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const image = 'data:image/jpeg;base64,abc';

function labReplies(...replies: [unknown, number?][]) {
    vi.stubEnv('MEALMAKER_API_KEY', 'key');
    const fetchMock = vi.fn();
    for (const [body, status = 200] of replies)
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify(body), { status }),
        );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const food = {
    fdcId: 1,
    description: 'Tomatoes, red, ripe, raw',
    name: 'Tomatoes, raw',
    match: { tier: 'confident' },
    per100g: { kcal: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2 },
};

it('returns each food seen once, with its matched nutrition', async () => {
    const fetchMock = labReplies([
        {
            photoHasFood: true,
            ingredients: [
                { said: ' tomato ', quantity: '3', food },
                { said: 'Tomato', food },
                { said: 'basil', food: null },
                { said: '', food: null },
            ],
        },
    ]);
    expect(await handleScanIngredients({ image })).toEqual({
        status: 200,
        body: {
            ingredients: [
                {
                    name: 'tomato',
                    food: {
                        fdcId: 1,
                        name: 'Tomatoes, raw',
                        description: 'Tomatoes, red, ripe, raw',
                        per100g: food.per100g,
                    },
                },
                { name: 'basil', food: null },
            ],
        },
    });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/ingredients\/scan$/);
    // Raw bytes: Nutrition Lab's scan rejects a JSON data URL.
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('image/jpeg');
    expect(Buffer.from(init.body).toString('base64')).toBe('abc=');
});

it('says so when the photo shows no food', async () => {
    labReplies([{ photoHasFood: false, ingredients: [] }]);
    expect((await handleScanIngredients({ image })).status).toBe(422);
});

it('retries once when the vision model fails', async () => {
    const fetchMock = labReplies(
        [{ error: { code: 'VISION_FAILED' } }, 502],
        [{ photoHasFood: true, ingredients: [{ said: 'lemon', food: null }] }],
    );
    const result = await handleScanIngredients({ image });
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('rejects a request without a photo', async () => {
    expect((await handleScanIngredients({})).status).toBe(400);
});
