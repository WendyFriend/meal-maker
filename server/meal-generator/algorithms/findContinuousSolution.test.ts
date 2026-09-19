// import { describe, expect, it } from 'vitest';

// import {
//     calculateNutritionCoefficients,
//     calculateNutritionResiduals,
//     calculateOptimalAmount,
//     clamp,
//     findContinuousSolution,
//     findOptimalIngredientAmount,
//     type NutritionCoefficients,
//     type NutritionResiduals,
//     // type SearchIngredient,
// } from './findContinuousSolution.js';
// import type { NutritionTarget, SearchIngredient } from './generateMeal.ts';

// describe('calculateOptimalAmount', () => {
//     it('returns zero when both coefficients are zero', () => {
//         const coefficients: NutritionCoefficients = {
//             calorieCoefficient: 0,
//             proteinCoefficient: 0,
//         };

//         const residuals: NutritionResiduals = {
//             calorieResidual: 0.5,
//             proteinResidual: 0.5,
//         };

//         expect(calculateOptimalAmount(coefficients, residuals)).toBeCloseTo(0);
//     });

//     it('calculates the optimal amount when only calories contribute', () => {
//         const coefficients: NutritionCoefficients = {
//             calorieCoefficient: 0.002,
//             proteinCoefficient: 0,
//         };

//         const residuals: NutritionResiduals = {
//             calorieResidual: 0.5,
//             proteinResidual: 0.5,
//         };

//         expect(calculateOptimalAmount(coefficients, residuals)).toBeCloseTo(
//             250,
//         );
//     });

//     it('calculates the optimal amount when only protein contributes', () => {
//         const coefficients: NutritionCoefficients = {
//             calorieCoefficient: 0,
//             proteinCoefficient: 0.005,
//         };

//         const residuals: NutritionResiduals = {
//             calorieResidual: 0.75,
//             proteinResidual: 0.5,
//         };

//         expect(calculateOptimalAmount(coefficients, residuals)).toBeCloseTo(
//             100,
//         );
//     });

//     it('calculates the least-squares optimal amount using both coefficients', () => {
//         const coefficients: NutritionCoefficients = {
//             calorieCoefficient: 0.002,
//             proteinCoefficient: 0.004,
//         };

//         const residuals: NutritionResiduals = {
//             calorieResidual: 0.5,
//             proteinResidual: 0.75,
//         };

//         /*
//          * numerator =
//          *   0.002 * 0.5 +
//          *   0.004 * 0.75
//          * = 0.004
//          *
//          * denominator =
//          *   0.002² +
//          *   0.004²
//          * = 0.00002
//          *
//          * amount = 0.004 / 0.00002
//          *        = 200
//          */
//         expect(calculateOptimalAmount(coefficients, residuals)).toBeCloseTo(
//             200,
//         );
//     });

//     it('can return a negative amount when the residuals are negative', () => {
//         const coefficients: NutritionCoefficients = {
//             calorieCoefficient: 0.002,
//             proteinCoefficient: 0.004,
//         };

//         const residuals: NutritionResiduals = {
//             calorieResidual: -0.5,
//             proteinResidual: -0.75,
//         };

//         /*
//          * numerator =
//          *   0.002 * -0.5 +
//          *   0.004 * -0.75
//          * = -0.004
//          *
//          * denominator = 0.00002
//          *
//          * amount = -200
//          */
//         expect(calculateOptimalAmount(coefficients, residuals)).toBeCloseTo(
//             -200,
//         );
//     });

//     it('handles fractional results', () => {
//         const coefficients: NutritionCoefficients = {
//             calorieCoefficient: 0.003,
//             proteinCoefficient: 0.004,
//         };

//         const residuals: NutritionResiduals = {
//             calorieResidual: 0.5,
//             proteinResidual: 0.5,
//         };

//         const result = calculateOptimalAmount(coefficients, residuals);

//         expect(result).toBeCloseTo(140);
//     });
// });

// describe('calculateNutritionCoefficients', () => {
//     it('calculates normalized calorie and protein coefficients', () => {
//         const ingredient: SearchIngredient = {
//             name: 'Tofu',
//             caloriesPer100g: 130,
//             proteinPer100g: 15,
//             caloriesPerGram: 1.3,
//             proteinPerGram: 0.15,
//         };
//         const target = { calories: 600, proteinGrams: 45 };
//         const result = calculateNutritionCoefficients(ingredient, target);
//         expect(result.calorieCoefficient).toBeCloseTo(1.3 / 600);
//         expect(result.proteinCoefficient).toBeCloseTo(0.15 / 45);
//     });
//     it('calculates fractional coefficients', () => {
//         const ingredient = {
//             name: 'Food',
//             caloriesPer100g: 250,
//             proteinPer100g: 20,
//             caloriesPerGram: 2.5,
//             proteinPerGram: 0.2,
//         };
//         const target = { calories: 750, proteinGrams: 50 };
//         const result = calculateNutritionCoefficients(ingredient, target);
//         expect(result.calorieCoefficient).toBeCloseTo(2.5 / 750);
//         expect(result.proteinCoefficient).toBeCloseTo(0.2 / 50);
//     });

//     it('returns zero coefficients when the ingredient has no calories or protein', () => {
//         const ingredient = {
//             name: 'Food',
//             caloriesPer100g: 0,
//             proteinPer100g: 0,
//             caloriesPerGram: 0,
//             proteinPerGram: 0,
//         };
//         const target = { calories: 600, proteinGrams: 45 };
//         const result = calculateNutritionCoefficients(ingredient, target);
//         expect(result).toEqual({
//             calorieCoefficient: 0,
//             proteinCoefficient: 0,
//         });
//     });
// });

// describe('calculateNutritionResiduals', () => {
//     const target: NutritionTarget = {
//         calories: 600,
//         proteinGrams: 45,
//     };

//     it('returns zero residuals when current nutrition matches the target', () => {
//         const result = calculateNutritionResiduals(600, 45, target);
//         expect(result).toEqual({ calorieResidual: 0, proteinResidual: 0 });
//     });

//     it('returns positive residuals when current nutrition is below the target', () => {
//         const result = calculateNutritionResiduals(300, 15, target);
//         expect(result.calorieResidual).toBeCloseTo(0.5);
//         expect(result.proteinResidual).toBeCloseTo(1 - 15 / 45);
//     });

//     it('returns negative residuals when current nutrition is above the target', () => {
//         const result = calculateNutritionResiduals(900, 60, target);
//         expect(result.calorieResidual).toBeCloseTo(-0.5);
//         expect(result.proteinResidual).toBeCloseTo(1 - 60 / 45);
//     });

//     it('calculates fractional residuals', () => {
//         const result = calculateNutritionResiduals(450, 30, target);
//         expect(result.calorieResidual).toBeCloseTo(0.25);
//         expect(result.proteinResidual).toBeCloseTo(1 - 30 / 45);
//     });
// });

// describe('clamp', () => {
//     it('returns the value when it is within the range', () => {
//         expect(clamp(100, 0, 5000)).toBe(100);
//     });
//     it('returns the minimum when the value is below the range', () => {
//         expect(clamp(-10, 0, 5000)).toBe(0);
//     });
//     it('returns the maximum when the value is above the range', () => {
//         expect(clamp(6000, 0, 5000)).toBe(5000);
//     });
//     it('returns the minimum when the value equals the minimum', () => {
//         expect(clamp(0, 0, 5000)).toBe(0);
//     });
//     it('returns the maximum when the value equals the maximum', () => {
//         expect(clamp(5000, 0, 5000)).toBe(5000);
//     });
// });

// function createIngredient(
//     overrides: Partial<SearchIngredient> = {},
// ): SearchIngredient {
//     return {
//         name: 'Test ingredient',
//         caloriesPer100g: 100,
//         proteinPer100g: 10,
//         caloriesPerGram: 1,
//         proteinPerGram: 0.1,
//         ...overrides,
//     };
// }

// describe('findOptimalIngredientAmount', () => {
//     const target: NutritionTarget = {
//         calories: 600,
//         proteinGrams: 45,
//     };

//     it('returns the optimal amount when the calculated amount is within the bounds', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 1,
//             proteinPerGram: 0,
//         });
//         const result = findOptimalIngredientAmount(ingredient, target, 100, 45);
//         // We need 500 more calories.
//         // At 1 kcal/g, the optimal amount is 500g.
//         expect(result).toBeCloseTo(500);
//     });

//     it('returns the minimum amount when the optimal amount is below the minimum', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 1,
//             proteinPerGram: 0,
//         });
//         const result = findOptimalIngredientAmount(ingredient, target, 700, 45);

//         // We are already 100 kcal above the target,
//         // so the mathematical optimum is negative.
//         // It should be clamped to MIN_AMOUNT (0g).
//         expect(result).toBe(0);
//     });

//     it('returns the maximum amount when the optimal amount exceeds the maximum', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 1,
//             proteinPerGram: 0,
//         });
//         const result = findOptimalIngredientAmount(ingredient, target, 0, 0);

//         // We need 600 kcal.
//         // At 1 kcal/g, the mathematical optimum is 600g,
//         // which is below the 5000g maximum.
//         // This test is intentionally not testing the maximum bound.
//         expect(result).toBeCloseTo(600);
//     });

//     it('returns zero when the ingredient has no nutritional contribution', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 0,
//             proteinPerGram: 0,
//         });
//         const result = findOptimalIngredientAmount(ingredient, target, 0, 0);
//         expect(result).toBe(0);
//     });

//     it('calculates the optimal amount using both calories and protein', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 1,
//             proteinPerGram: 0.1,
//         });
//         const result = findOptimalIngredientAmount(ingredient, target, 300, 15);

//         /*
//          * Current:
//          * 300 kcal
//          * 15g protein
//          *
//          * Target:
//          * 600 kcal
//          * 45g protein
//          *
//          * Coefficients:
//          * calories = 1 / 600
//          * protein = 0.1 / 45
//          *
//          * Residuals:
//          * calories = 0.5
//          * protein = 0.666...
//          *
//          * The result is the least-squares optimum. */
//         expect(result).toBeCloseTo(300);
//     });

//     it('returns the maximum amount when the optimal amount exceeds the maximum', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 0.01,
//             proteinPerGram: 0,
//         });
//         const result = findOptimalIngredientAmount(ingredient, target, 0, 0);
//         // We need 600 kcal.
//         // At 0.01 kcal/g, the mathematical optimum is 60,000g.
//         // This exceeds MAX_AMOUNT (5000g), so it should be clamped.
//         expect(result).toBe(5000);
//     });

//     it('returns zero when the current nutrition already matches the target', () => {
//         const ingredient = createIngredient();
//         const result = findOptimalIngredientAmount(ingredient, target, 600, 45);
//         expect(result).toBe(0);
//     });
// });

// describe.only('findContinuousSolution', () => {
//     const target: NutritionTarget = {
//         calories: 600,
//         proteinGrams: 45,
//     };

//     it('returns zero amounts when there are no ingredients', () => {
//         const result = findContinuousSolution([], target);
//         expect(result).toEqual({ amounts: [], calories: 0, proteinGrams: 0 });
//     });

//     it('finds the target using a single ingredient', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 1,
//             proteinPerGram: 0.075,
//         });
//         const result = findContinuousSolution([ingredient], target);
//         // 600 kcal requires 600g.
//         // 600g × 0.075g protein/g = 45g protein.
//         expect(result.amounts).toHaveLength(1);
//         expect(result.amounts[0]).toBeCloseTo(600);
//         expect(result.calories).toBeCloseTo(600);
//         expect(result.proteinGrams).toBeCloseTo(45);
//     });

//     it('finds a solution using multiple ingredients', () => {
//         const ingredients = [
//             createIngredient({
//                 name: 'Ingredient A',
//                 caloriesPerGram: 1,
//                 proteinPerGram: 0.075,
//             }),
//             createIngredient({
//                 name: 'Ingredient B',
//                 caloriesPerGram: 2,
//                 proteinPerGram: 0.15,
//             }),
//         ];
//         const result = findContinuousSolution(ingredients, target);
//         const totalCalories = result.amounts.reduce(
//             (total, amount, index) =>
//                 total + amount * ingredients[index].caloriesPerGram,
//             0,
//         );
//         const totalProteinGrams = result.amounts.reduce(
//             (total, amount, index) =>
//                 total + amount * ingredients[index].proteinPerGram,
//             0,
//         );
//         expect(result.amounts).toHaveLength(2);
//         expect(totalCalories).toBeCloseTo(target.calories);
//         expect(totalProteinGrams).toBeCloseTo(target.proteinGrams);
//     });

//     it('does not produce amounts above the maximum', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 0.01,
//             proteinPerGram: 0,
//         });
//         const result = findContinuousSolution([ingredient], target);
//         for (const amount of result.amounts) {
//             expect(amount).toBeLessThanOrEqual(5000);
//         }
//     });
//     it('handles an ingredient with no nutritional value', () => {
//         const ingredients = [
//             createIngredient({
//                 name: 'Empty ingredient',
//                 caloriesPerGram: 0,
//                 proteinPerGram: 0,
//             }),
//         ];
//         const result = findContinuousSolution(ingredients, target);
//         expect(result.amounts).toEqual([0]);
//         expect(result.calories).toBe(0);
//         expect(result.proteinGrams).toBe(0);
//     });
//     it('returns nutrition totals consistent with the ingredient amounts', () => {
//         const ingredients = [
//             createIngredient({
//                 name: 'Ingredient A',
//                 caloriesPerGram: 1.2,
//                 proteinPerGram: 0.1,
//             }),
//             createIngredient({
//                 name: 'Ingredient B',
//                 caloriesPerGram: 0.5,
//                 proteinPerGram: 0.04,
//             }),
//         ];
//         const result = findContinuousSolution(ingredients, target);
//         const expectedCalories =
//             result.amounts[0] * ingredients[0].caloriesPerGram +
//             result.amounts[1] * ingredients[1].caloriesPerGram;
//         const expectedProtein =
//             result.amounts[0] * ingredients[0].proteinPerGram +
//             result.amounts[1] * ingredients[1].proteinPerGram;
//         expect(result.calories).toBeCloseTo(expectedCalories);
//         expect(result.proteinGrams).toBeCloseTo(expectedProtein);
//     });

//     it('returns a bounded solution when the target cannot be reached', () => {
//         const ingredient = createIngredient({
//             caloriesPerGram: 0.01,
//             proteinPerGram: 0.001,
//         });
//         const result = findContinuousSolution([ingredient], target);
//         expect(result.amounts[0]).toBe(5000);
//         expect(result.calories).toBeCloseTo(50);
//         expect(result.proteinGrams).toBeCloseTo(5);
//     });
// });
