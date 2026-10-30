import type {
    MealMakerFood,
    MealMakerFoodDetail,
    MealMakerGenerateRequest,
    MealMakerParseResponse,
    MealMakerSearchResponse,
} from './types.js';

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
        throw new Error(
            `MealMaker API request failed: ${response.status} ${body?.error?.code ?? response.statusText}`,
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

export function searchFoods(
    query: string,
    limit: number,
): Promise<MealMakerSearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return request<MealMakerSearchResponse>(
        `/foods/search?${params}`,
        {},
        10_000,
    );
}

// Splitting can consult a model, so allow a few seconds.
export function parseIngredientText(
    text: string,
): Promise<MealMakerParseResponse> {
    return request<MealMakerParseResponse>(
        '/parse',
        { method: 'POST', body: JSON.stringify({ text }) },
        30_000,
    );
}

export function getFoodDetail(fdcId: number): Promise<MealMakerFoodDetail> {
    return request<MealMakerFoodDetail>(`/foods/${fdcId}`);
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
