import type {
    MealMakerFood,
    MealMakerFoodSearchResponse,
    MealMakerFoodDetail,
    MealMakerGenerateRequest,
    MealMakerIngredientScanResponse,
    MealMakerLabelResponse,
    MealMakerParseResponse,
} from './types.js';

/** A failed Nutrition Lab request, keeping its status for the caller. */
export class MealMakerApiError extends Error {
    readonly status: number;
    readonly code: string | undefined;

    constructor(status: number, code: string | undefined, statusText: string) {
        super(`MealMaker API request failed: ${status} ${code ?? statusText}`);
        this.name = 'MealMakerApiError';
        this.status = status;
        this.code = code;
    }
}

const DEFAULT_BASE_URL = 'https://mealmaker.brotherk3d.com/api/v1';

async function request<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = 20_000,
): Promise<T> {
    const apiKey = process.env.MEALMAKER_API_KEY;
    if (!apiKey) {
        throw new Error('MEALMAKER_API_KEY environment variable is not set');
    }
    const baseUrl = (process.env.MEALMAKER_API_URL ?? DEFAULT_BASE_URL).replace(
        /\/+$/,
        '',
    );

    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
            { error?: { code?: string } } | undefined;
        throw new MealMakerApiError(
            response.status,
            body?.error?.code,
            response.statusText,
        );
    }
    return (await response.json()) as T;
}

export async function resolveFood(
    term: string,
): Promise<MealMakerFood | undefined> {
    const { results } = await request<{
        results: { term: string; food: MealMakerFood | null }[];
    }>('/foods/resolve', {
        method: 'POST',
        body: JSON.stringify({ terms: [term] }),
    });
    return results[0]?.food ?? undefined;
}

export function getFoodDetail(fdcId: number): Promise<MealMakerFoodDetail> {
    return request<MealMakerFoodDetail>(`/foods/${fdcId}`);
}

export function searchNutritionLabFoods(
    query: string,
    limit = 12,
): Promise<MealMakerFoodSearchResponse> {
    return request<MealMakerFoodSearchResponse>(
        `/foods/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
}

// Multi-word text can consult a model, so allow a few seconds.
export function parseIngredientText(
    text: string,
): Promise<MealMakerParseResponse> {
    return request<MealMakerParseResponse>(
        '/parse',
        { method: 'POST', body: JSON.stringify({ text }) },
        30_000,
    );
}

// Generation takes 4-60 s.
export function generateMealRemote(
    body: MealMakerGenerateRequest,
): Promise<unknown> {
    return request<unknown>(
        '/meals/generate',
        { method: 'POST', body: JSON.stringify(body) },
        90_000,
    );
}

// Reading a label takes 2-10 s. `ingredient=1` adds the per-100g values in
// the field names /meals/generate uses.
export function scanIngredientsRemote(
    image: string,
): Promise<MealMakerIngredientScanResponse> {
    // Sent as raw bytes: /ingredients/scan answers a JSON data URL with
    // 415 UNSUPPORTED_IMAGE, although its docs allow it.
    const [, type = 'image/jpeg', data = ''] =
        /^data:([^;]+);base64,(.*)$/s.exec(image) ?? [];
    return request<MealMakerIngredientScanResponse>(
        '/ingredients/scan',
        {
            method: 'POST',
            headers: { 'Content-Type': type },
            body: Buffer.from(data, 'base64'),
        },
        30_000,
    );
}

export function readNutritionLabelRemote(
    image: string,
    name?: string,
): Promise<MealMakerLabelResponse> {
    const query = new URLSearchParams({ ingredient: '1' });
    if (name) query.set('name', name);
    return request<MealMakerLabelResponse>(
        `/labels/read?${query}`,
        { method: 'POST', body: JSON.stringify({ image }) },
        30_000,
    );
}
