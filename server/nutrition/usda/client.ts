import type { USDASearchResponse } from './types.js';

const USDA_API_KEY = process.env.USDA_API_KEY;

if (!USDA_API_KEY) {
    throw new Error('USDA_API_KEY environment variable is not set');
}

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
    const searchParams = new URLSearchParams({
        query: params.query,
        dataType: params.dataType?.join(',') ?? 'SR Legacy',
        pageSize: String(params.pageSize ?? 5),
        pageNumber: String(params.pageNumber ?? 1),
        sortBy: params.sortBy ?? 'dataType.keyword',
        sortOrder: params.sortOrder ?? 'asc',
        api_key: USDA_API_KEY!,
    });

    const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?${searchParams}`,
    );

    if (!response.ok) {
        throw new Error(
            `USDA API request failed: ${response.status} ${response.statusText}`,
        );
    }
    const data = (await response.json()) as USDASearchResponse;
    return data;
}
