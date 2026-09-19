// import { describe, expect, it } from 'vitest';
// import { findNutrition } from './nutrition';

// describe('findNutrition', () => {
//     it('returns nutrition information for a known ingredient', () => {
//         const result = findNutrition('Tofu');

//         expect(result).toEqual({
//             name: 'Tofu',
//             caloriesPer100g: 130,
//             proteinPer100g: 14,
//         });
//     });

//     it('is case-insensitive', () => {
//         const result = findNutrition('tofu');

//         expect(result).toEqual({
//             name: 'Tofu',
//             caloriesPer100g: 130,
//             proteinPer100g: 14,
//         });
//     });

//     it('returns undefined for an unknown ingredient', () => {
//         const result = findNutrition('Banana');

//         expect(result).toBeUndefined();
//     });

//     it('ignores surrounding whitespace', () => {
//         const result = findNutrition('  tofu  ');

//         expect(result).toEqual({
//             name: 'Tofu',
//             caloriesPer100g: 130,
//             proteinPer100g: 14,
//         });
//     });
// });
