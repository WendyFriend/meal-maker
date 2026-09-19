// import { describe, expect, it } from 'vitest';
// import { buildMealPrompt } from './buildMealPrompt.js';
// import { mockIngredientNutrition } from '../../client/meal-generator/mockData.ts';

// describe('buildMealPrompt', () => {
//     it('includes nutrition information when available', () => {
//         const input = {
//             ingredients: ['tofu'],
//             nutrition: mockIngredientNutrition,
//             requirements: {
//                 calories: 500,
//             },
//         };
//         expect(buildMealPrompt(input)).toContain(
//             '- tofu: 130 kcal/100g, 14g protein/100g',
//         );
//     });
//     it('marks missing nutrition as unavailable', () => {
//         const input = {
//             ingredients: ['rice'],
//             nutrition: mockIngredientNutrition,
//             requirements: {
//                 calories: 500,
//             },
//         };
//         expect(buildMealPrompt(input)).toContain(
//             '- rice: nutritional information unavailable',
//         );
//     });
//     it('includes calorie requirement', () => {
//         const input = {
//             ingredients: ['tofu'],
//             nutrition: mockIngredientNutrition,
//             requirements: {
//                 calories: 500,
//             },
//         };
//         expect(buildMealPrompt(input)).toContain('Calorie goal: 500 kcal');
//     });
//     it('includes protein percentage requirement', () => {
//         const input = {
//             ingredients: ['tofu'],
//             nutrition: mockIngredientNutrition,
//             requirements: {
//                 calories: 500,
//                 proteinPercentage: 20,
//             },
//         };
//         expect(buildMealPrompt(input)).toContain(
//             'Protein goal: 20% of calories should come from protein',
//         );
//     });
//     it('uses no preference when a requirement is absent', () => {
//         const input = {
//             ingredients: ['tofu'],
//             nutrition: mockIngredientNutrition,
//             requirements: {},
//         };

//         const prompt = buildMealPrompt(input);

//         expect(prompt).toContain('Calorie goal: no preference');
//         expect(prompt).toContain('Protein goal: no preference');
//     });
// });
