import { searchNutritionLabFoods } from './mealmaker/client.js';

export async function handleFoodSearch(query: unknown) {
    if (
        typeof query !== 'string' ||
        query.trim().length < 2 ||
        query.length > 100
    )
        return {
            status: 400,
            body: { message: 'Enter at least two characters.' },
        };
    const { results } = await searchNutritionLabFoods(query.trim(), 12);
    return {
        status: 200,
        body: {
            results: results.map(({ fdcId, name, description, per100g }) => ({
                fdcId,
                name: name?.trim() || description,
                description,
                per100g,
            })),
        },
    };
}
