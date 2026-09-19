// import { describe, expect, it } from 'vitest';
// import { isGeneratedMeal } from './validateGeneratedMeal.js';

// describe('isGeneratedMeal', () => {
//     it('accepts a valid generated meal', () => {
//         expect(
//             isGeneratedMeal({
//                 meal: {
//                     totalCalories: 500,
//                     totalProteinGrams: 25,
//                     ingredients: [
//                         {
//                             name: 'Tofu',
//                             amount: 150,
//                             caloriesPer100g: 130,
//                             proteinPer100g: 14,
//                         },
//                     ],
//                 },
//             }),
//         ).toBe(true);
//     });

//     it('rejects an ingredient with missing nutrition', () => {
//         expect(
//             isGeneratedMeal({
//                 meal: {
//                     totalCalories: 500,
//                     totalProteinGrams: 25,
//                     ingredients: [
//                         {
//                             name: 'Tofu',
//                             amount: 150,
//                             caloriesPer100g: 130,
//                         },
//                     ],
//                 },
//             }),
//         ).toBe(false);
//     });

//     it('rejects incorrectly named nutrition fields', () => {
//         expect(
//             isGeneratedMeal({
//                 meal: {
//                     totalCalories: 500,
//                     totalProteinGrams: 25,
//                     ingredients: [
//                         {
//                             name: 'Tofu',
//                             amount: 150,
//                             caloriesper100g: 130,
//                             proteinPer100g: 14,
//                         },
//                     ],
//                 },
//             }),
//         ).toBe(false);
//     });
// });
