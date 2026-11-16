import { getNutritionForIngredients } from './getNutritionForIngredients.js';

export async function handleIngredientNutrition(input: unknown) {
    const name =
        typeof input === 'object' && input !== null && 'name' in input
            ? input.name
            : undefined;
    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
        return {
            status: 400,
            body: { message: 'Provide an ingredient name.' },
        };
    }
    const { ingredientsWithNutrition } = await getNutritionForIngredients([
        { name: name.trim() },
    ]);
    const ingredient = ingredientsWithNutrition[0];
    return ingredient
        ? { status: 200, body: ingredient }
        : {
              status: 404,
              body: {
                  message: 'Nutrition data is unavailable for this ingredient.',
              },
          };
}
