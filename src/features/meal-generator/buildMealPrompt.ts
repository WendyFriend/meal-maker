import type { GenerateMealInput } from './types';

export function buildMealPrompt(input: GenerateMealInput): string {
    const { ingredients, nutrition, requirements } = input;

    const calorieGoal =
        requirements.calories !== undefined
            ? `${requirements.calories} kcal`
            : 'no preference';

    const proteinGoal =
        requirements.proteinPercentage !== undefined
            ? `${requirements.proteinPercentage}% of calories should come from protein`
            : 'no preference';

    const ingredientLines = ingredients.map((name) => {
        const ingredientNutrition = nutrition.find(
            (ingredient) =>
                ingredient.name.toLowerCase() === name.toLowerCase(),
        );

        if (!ingredientNutrition) {
            return `- ${name}: nutritional information unavailable`;
        }

        return `- ${name}: ${ingredientNutrition.caloriesPer100g} kcal/100g, ${ingredientNutrition.proteinPer100g}g protein/100g`;
    });

    return `Generate a meal using the ingredients below.

Calorie goal: ${calorieGoal}
Protein goal: ${proteinGoal}

Ingredients:
${ingredientLines.join('\n')}

For ingredients where nutritional information is unavailable, use a reliable nutritional source.

Please choose sensible amounts for the ingredients and try to meet the user's nutritional goals.

All ingredient amounts should be specified in grams as numbers.

Return ONLY valid JSON in this format:

{
  "meal": {
    "ingredients": [
      {
        "name": "Pumpkin",
        "amount": 200
      }
    ]
  }
}`;
}
