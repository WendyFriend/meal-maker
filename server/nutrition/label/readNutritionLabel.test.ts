// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
    handleNutritionLabel,
    labelScanFromResponse,
} from './readNutritionLabel.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const cell = (value: number | null, unit: string | null = 'g') => ({
    text: `${value} ${unit}`,
    value,
    unit,
    lessThan: false,
});

const image = 'data:image/jpeg;base64,abc';

function labReplies(body: unknown, status = 200) {
    vi.stubEnv('MEALMAKER_API_KEY', 'key');
    const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

it('uses the lab ingredient and fills gaps from the per 100 column', () => {
    expect(
        labelScanFromResponse({
            labelFound: true,
            servingSize: '40 g',
            per100: {
                calories: cell(379, 'kcal'),
                fibre: cell(10.2),
                sugars: cell(null),
            },
            ingredient: {
                name: 'Rolled oats',
                proteinPer100g: 13.5,
                carbohydratePer100g: 59.7,
                fatPer100g: 7.1,
                ironPer100g: 3.6,
                sodiumPer100g: 4,
            },
            warnings: ['Energy does not add up.'],
            basis: '100g',
        }),
    ).toEqual({
        nutrition: {
            caloriesPer100g: 379,
            proteinPer100g: 13.5,
            carbohydratePer100g: 59.7,
            fatPer100g: 7.1,
            fiberPer100g: 10.2,
            ironPer100g: 3.6,
        },
        basis: '100g',
        warnings: ['Energy does not add up.'],
    });
});

it('converts kilojoules and label units, keeping zeros', () => {
    expect(
        labelScanFromResponse({
            labelFound: true,
            servingSize: null,
            per100: {
                energyKj: cell(1674, 'kJ'),
                fatTotal: cell(0),
                calcium: cell(0.12, 'g'),
            },
            basis: '100mL',
        }),
    ).toEqual({
        nutrition: {
            caloriesPer100g: 400,
            fatPer100g: 0,
            calciumPer100g: 120,
        },
        basis: '100mL',
        warnings: [],
    });
});

it('rejects non-image input before calling the lab', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await handleNutritionLabel({ image: 'hello' });
    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
});

it('sends the photo and name to Nutrition Lab', async () => {
    const fetchMock = labReplies({
        labelFound: true,
        servingSize: null,
        per100: {},
        ingredient: { proteinPer100g: 3 },
    });
    const result = await handleNutritionLabel({ image, name: ' Soy milk ' });
    expect(result).toEqual({
        status: 200,
        body: {
            nutrition: { proteinPer100g: 3 },
            basis: '100g',
            warnings: [],
        },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
        'https://mealmaker.brotherk3d.com/api/v1/labels/read?ingredient=1&name=Soy+milk',
    );
    expect(init.headers.Authorization).toBe('Bearer key');
    expect(JSON.parse(init.body)).toEqual({ image });
});

it('reports photos without a label', async () => {
    labReplies({ labelFound: false, servingSize: null, per100: {} });
    expect((await handleNutritionLabel({ image })).status).toBe(422);
});

it('retries once when the vision model fails', async () => {
    const fetchMock = labReplies({ error: { code: 'MODEL_FAILED' } }, 502);
    fetchMock
        .mockResolvedValueOnce(new Response('{}', { status: 502 }))
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    labelFound: true,
                    servingSize: null,
                    per100: { protein: cell(5) },
                }),
            ),
        );
    const result = await handleNutritionLabel({ image });
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('explains rate limits', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    labReplies({ error: { code: 'RATE_LIMITED' } }, 429);
    expect(await handleNutritionLabel({ image })).toEqual({
        status: 429,
        body: { message: 'Too many scans right now. Try again in a minute.' },
    });
});
