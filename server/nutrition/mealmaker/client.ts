import type {
    MealMakerFood,
    MealMakerFoodDetail,
    MealMakerGenerateRequest,
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
