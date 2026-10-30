import { getNutritionForIngredients } from './getNutritionForIngredients.js';
import { parseMealGenerator } from '../meal-generator/handleGenerateMealRequest.js';

export async function handleIngredientNutrition(
    input: unknown,
    generatorHeader?: string | string[],
) {
    const generator = parseMealGenerator(generatorHeader);
    if (!generator) {
        return { status: 400, body: { message: 'Unknown meal generator.' } };
    }
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
    const { ingredientsWithNutrition } = await getNutritionForIngredients(
        [{ name: name.trim() }],
        generator === 'nutrition-lab' ? 'nutrition-lab' : 'usda',
    );
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
