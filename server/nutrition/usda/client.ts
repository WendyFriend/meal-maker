import type { USDASearchResponse } from './types.js';

type FoodSearchParams = {
    query: string;
    dataType?: string[];
    pageSize?: number;
    pageNumber?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
};

export async function searchFoods(
    params: FoodSearchParams,
): Promise<USDASearchResponse> {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
        throw new Error('USDA_API_KEY environment variable is not set');
    }

    const searchParams = new URLSearchParams({
        query: params.query,
        dataType: params.dataType?.join(',') ?? 'SR Legacy',
        pageSize: String(params.pageSize ?? 5),
        pageNumber: String(params.pageNumber ?? 1),
        sortBy: params.sortBy ?? 'dataType.keyword',
        sortOrder: params.sortOrder ?? 'asc',
        api_key: apiKey,
    });

    const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?${searchParams}`,
        { signal: AbortSignal.timeout(10_000) },
    );

    if (!response.ok) {
        throw new Error(
            `USDA API request failed: ${response.status} ${response.statusText}`,
        );
    }
    const data = (await response.json()) as USDASearchResponse;
    return data;
}
