import { checkProteinFeasibility } from './meal-generator/checkProteinFeasibility.js';
import { generateMeal } from './meal-generator/algorithms/generateMeal.js';
import { getNutritionForIngredients } from './nutrition/getNutritionForIngredients.js';
import type { GenerateMealRequest } from '../shared/types/types.ts';

export async function handleGenerateMeal(input: GenerateMealRequest) {
    const { ingredientsWithNutrition, unresolvedIngredients } =
        await getNutritionForIngredients(input.ingredients);

    const feasibility = checkProteinFeasibility(
        ingredientsWithNutrition,
        input.requirements.proteinPercentage,
    );

    if (!feasibility.feasible) {
        return {
            status: 422,
            body: {
                error: {
                    code: 'REQUIREMENT_NOT_MET',
                    message: `Protein goal can't be reached`,
                    proteinGoal: input.requirements.proteinPercentage!,
                    maximumProteinPercentage:
                        feasibility.maximumProteinPercentage,
                },
            },
        };
    }

    const mealIngredients = generateMeal(
        ingredientsWithNutrition,
        input.requirements,
    );

    const result = {
        mealIngredients,
        unresolvedIngredients,
    };

    console.log('result:', result);

    return {
        status: 200,
        body: result,
    };
}
