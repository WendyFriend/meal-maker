// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { handleNutritionLabel, labelToPer100g } from './readNutritionLabel.js';
import { parseJsonObject } from '../../ai/vision.js';

afterEach(() => vi.unstubAllGlobals());

it('uses the per 100g column when the label has one', () => {
    expect(
        labelToPer100g({
            productName: ' Rolled oats ',
            servingSizeGrams: 40,
            per100g: {
                energyKcal: 379,
                protein: 13.5,
                carbohydrate: 59.7,
                fat: 7.1,
                sugar: null,
                fiber: '10.2g',
            },
            perServing: { energyKcal: 152 },
        }),
    ).toEqual({
        productName: 'Rolled oats',
        nutrition: {
            caloriesPer100g: 379,
            proteinPer100g: 13.5,
            carbohydratePer100g: 59.7,
            fatPer100g: 7.1,
            fiberPer100g: 10.2,
        },
    });
});

it('scales a per-serving label and converts kilojoules', () => {
    expect(
        labelToPer100g({
            servingSizeGrams: 30,
            per100g: null,
            perServing: { energyKj: 502, protein: 3, fat: 0 },
        }).nutrition,
    ).toEqual({ caloriesPer100g: 400, proteinPer100g: 10, fatPer100g: 0 });
});

it('returns nothing it cannot convert to per 100g', () => {
    expect(
        labelToPer100g({ perServing: { protein: 3 }, servingSizeGrams: null })
            .nutrition,
    ).toEqual({});
    expect(labelToPer100g('not json').nutrition).toEqual({});
});

it('rejects non-image input before calling the model', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await handleNutritionLabel({ image: 'hello' });
    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
});

it('sends the photo to the vision model and reports unreadable labels', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'key');
    vi.stubEnv('OLLAMA_MODEL', 'gemma4');
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                choices: [{ message: { content: '{"per100g":null}' } }],
            }),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const image = 'data:image/jpeg;base64,abc';
    const result = await handleNutritionLabel({ image });
    expect(result.status).toBe(422);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gemma4');
    expect(body.messages[1].content[1]).toEqual({
        type: 'image_url',
        image_url: { url: image },
    });
    vi.unstubAllEnvs();
});

it('reads JSON wrapped in a code fence', () => {
    expect(parseJsonObject('```json\n{"per100g":{"protein":1}}\n```')).toEqual({
        per100g: { protein: 1 },
    });
    expect(parseJsonObject('no json here')).toBeUndefined();
});
