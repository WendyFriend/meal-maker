// import { describe, expect, it } from 'vitest';
// import {
//     getNutritionTarget,
//     validateInput,
//     type GenerateMealInput,
// } from './generateMeal.js';

// describe('getNutritionTarget', () => {
//     it('uses default calories and protein percentage when no requirements are provided', () => {
//         const requirements = {};

//         // const result = getNutritionTarget(requirements);

//         expect(result).toEqual({
//             calories: 600,
//             proteinGrams: 45,
//         });
//     });

//     it('uses the provided calorie target and default protein percentage', () => {
//         const requirements = {
//             calories: 800,
//         };

//         const result = getNutritionTarget(requirements);

//         expect(result).toEqual({
//             calories: 800,
//             proteinGrams: 60,
//         });
//     });

//     it('uses the provided protein percentage and default calories', () => {
//         const requirements = {
//             proteinPercentage: 40,
//         };

//         const result = getNutritionTarget(requirements);

//         expect(result).toEqual({
//             calories: 600,
//             proteinGrams: 60,
//         });
//     });

//     it('uses both provided calorie and protein targets', () => {
//         const requirements = {
//             calories: 700,
//             proteinPercentage: 25,
//         };

//         const result = getNutritionTarget(requirements);

//         expect(result).toEqual({
//             calories: 700,
//             proteinGrams: 43.75,
//         });
//     });

//     it('calculates protein grams correctly for fractional values', () => {
//         const requirements = {
//             calories: 500,
//             proteinPercentage: 25,
//         };

//         const result = getNutritionTarget(requirements);

//         expect(result.proteinGrams).toBeCloseTo(31.25);
//     });
// });

// describe('validateInput', () => {
//     const validIngredient = {
//         name: 'Tofu',
//         caloriesPer100g: 130,
//         proteinPer100g: 15,
//     };

//     const validInput: GenerateMealInput = {
//         nutrition: [validIngredient],
//         requirements: {
//             calories: 600,
//             proteinPercentage: 30,
//         },
//     };

//     it('does not throw for valid input', () => {
//         expect(() => validateInput(validInput)).not.toThrow();
//     });

//     it('does not throw when requirements are omitted', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {},
//         };

//         expect(() => validateInput(input)).not.toThrow();
//     });

//     it('throws when there are no ingredients', () => {
//         const input: GenerateMealInput = {
//             nutrition: [],
//             requirements: {},
//         };

//         expect(() => validateInput(input)).toThrow(
//             'At least one ingredient is required.',
//         );
//     });

//     it('throws when calories are zero', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {
//                 calories: 0,
//             },
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Calories must be greater than zero.',
//         );
//     });

//     it('throws when calories are negative', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {
//                 calories: -100,
//             },
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Calories must be greater than zero.',
//         );
//     });

//     it('allows zero percent protein', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {
//                 proteinPercentage: 0,
//             },
//         };

//         expect(() => validateInput(input)).not.toThrow();
//     });

//     it('allows 100 percent protein', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {
//                 proteinPercentage: 100,
//             },
//         };

//         expect(() => validateInput(input)).not.toThrow();
//     });

//     it('throws when protein percentage is negative', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {
//                 proteinPercentage: -1,
//             },
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Protein percentage must be between 0 and 100.',
//         );
//     });

//     it('throws when protein percentage is greater than 100', () => {
//         const input: GenerateMealInput = {
//             nutrition: [validIngredient],
//             requirements: {
//                 proteinPercentage: 100.1,
//             },
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Protein percentage must be between 0 and 100.',
//         );
//     });

//     it('throws when ingredient calories are negative', () => {
//         const input: GenerateMealInput = {
//             nutrition: [
//                 {
//                     ...validIngredient,
//                     caloriesPer100g: -1,
//                 },
//             ],
//             requirements: {},
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Nutrition values for "Tofu" cannot be negative.',
//         );
//     });

//     it('throws when ingredient protein is negative', () => {
//         const input: GenerateMealInput = {
//             nutrition: [
//                 {
//                     ...validIngredient,
//                     proteinPer100g: -1,
//                 },
//             ],
//             requirements: {},
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Nutrition values for "Tofu" cannot be negative.',
//         );
//     });

//     it('throws when any ingredient has invalid nutrition', () => {
//         const input: GenerateMealInput = {
//             nutrition: [
//                 validIngredient,
//                 {
//                     name: 'Invalid Ingredient',
//                     caloriesPer100g: 100,
//                     proteinPer100g: -5,
//                 },
//             ],
//             requirements: {},
//         };

//         expect(() => validateInput(input)).toThrow(
//             'Nutrition values for "Invalid Ingredient" cannot be negative.',
//         );
//     });
// });
