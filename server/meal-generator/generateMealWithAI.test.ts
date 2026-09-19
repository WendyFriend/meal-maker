// import { describe, expect, it, vi } from 'vitest';
// import { generateMealWithAI } from './generateMealWithAI.ts';
// import type { GenerateMealInput } from '../../client/meal-generator/types.ts';
// import type { AiClient } from '../ai/AiClient.ts';

// describe('generateMealWithAI', () => {
//     const input: GenerateMealInput = {
//         ingredients: ['Tofu', 'Pumpkin', 'Kale'],
//         nutrition: [],
//         requirements: {
//             calories: 500,
//             proteinPercentage: 20,
//         },
//     };

//     it('returns the parsed meal when AI returns a valid response', async () => {
//         const response = JSON.stringify({
//             meal: {
//                 totalCalories: 500,
//                 totalProteinGrams: 25,
//                 ingredients: [
//                     {
//                         name: 'Tofu',
//                         amount: 150,
//                         caloriesPer100g: 130,
//                         proteinPer100g: 14,
//                     },
//                     {
//                         name: 'Pumpkin',
//                         amount: 200,
//                         caloriesPer100g: 26,
//                         proteinPer100g: 1,
//                     },
//                 ],
//             },
//         });

//         const aiClient: AiClient = {
//             generate: vi.fn().mockResolvedValue(response),
//         };

//         const result = await generateMealWithAI(input, aiClient);

//         expect(result).toEqual(JSON.parse(response));
//     });

//     it('sends the generated prompt to the AI client', async () => {
//         const response = JSON.stringify({
//             meal: {
//                 totalCalories: 500,
//                 totalProteinGrams: 25,
//                 ingredients: [
//                     {
//                         name: 'Tofu',
//                         amount: 150,
//                         caloriesPer100g: 130,
//                         proteinPer100g: 14,
//                     },
//                 ],
//             },
//         });

//         const aiClient: AiClient = {
//             generate: vi.fn().mockResolvedValue(response),
//         };

//         await generateMealWithAI(input, aiClient);

//         expect(aiClient.generate).toHaveBeenCalledTimes(1);

//         expect(aiClient.generate).toHaveBeenCalledWith(
//             expect.stringContaining('Tofu'),
//         );
//     });

//     it('throws when AI returns invalid JSON', async () => {
//         const aiClient: AiClient = {
//             generate: vi.fn().mockResolvedValue('not valid JSON'),
//         };

//         await expect(generateMealWithAI(input, aiClient)).rejects.toThrow(
//             SyntaxError,
//         );
//     });

//     it('throws when AI returns an invalid meal response', async () => {
//         const response = JSON.stringify({
//             meal: {
//                 totalCalories: 500,
//                 // Missing totalProteinGrams
//                 ingredients: [],
//             },
//         });

//         const aiClient: AiClient = {
//             generate: vi.fn().mockResolvedValue(response),
//         };

//         await expect(generateMealWithAI(input, aiClient)).rejects.toThrow(
//             'AI returned an invalid meal response',
//         );
//     });
// });
