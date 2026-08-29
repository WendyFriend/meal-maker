import type { IngredientNutrition } from "../../src/features/meal-generator/types.ts";

export type ProteinFeasibilityResult =
    | {
          feasible: true;
      }
    | {
          feasible: false;
          maximumProteinPercentage: number;
      };
      
export function checkProteinFeasibility(
    nutrition: IngredientNutrition[],
    proteinPercentage: number | undefined,
): ProteinFeasibilityResult {
    if (proteinPercentage === undefined) {
        return { feasible: true };
    }

    const proteinPercentages = nutrition
        .filter((ingredient) => ingredient.caloriesPer100g > 0)
        .map(
            (ingredient) =>
                (ingredient.proteinPer100g * 4 * 100) /
                ingredient.caloriesPer100g,
        );

    if (proteinPercentages.length === 0) {
        return {
            feasible: false,
            maximumProteinPercentage: 0,
        };
    }

    const maximumProteinPercentage = Math.max(...proteinPercentages);

    return proteinPercentage <= maximumProteinPercentage
        ? { feasible: true }
        : {
              feasible: false,
              maximumProteinPercentage,
          };
}
