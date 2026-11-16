import { expect, it } from 'vitest';
import type { IngredientInfo } from '../../../shared/types/types';
import {
    applyNutritionForm,
    errorMessage,
    ingredientFromFood,
    nutritionForm,
} from './nutritionForm';

const oats: IngredientInfo & { ingredientId: string } = {
    name: 'oats',
    ingredientId: 'oats-id',
    caloriesPer100g: 389,
    proteinPer100g: 16.9,
    carbohydratePer100g: 66.3,
    fatPer100g: 6.9,
    ironPer100g: 4.7,
    zincPer100g: 0,
    preparationTips: ['Soak overnight'],
};

it('fills the form from the shown nutrition, keeping genuine zeros', () => {
    const form = nutritionForm(oats);
    expect(form.macros).toMatchObject({
        caloriesPer100g: '389',
        sugarPer100g: '',
    });
    expect(form.micros).toMatchObject({
        ironPer100g: '4.7',
        zincPer100g: '0',
        calciumPer100g: '',
    });
});

it('applies typed values, clears blanks and marks cleared micronutrients unavailable', () => {
    const form = nutritionForm(oats);
    form.macros.caloriesPer100g = ' 400 ';
    form.macros.fatPer100g = '';
    form.micros.ironPer100g = '';
    form.micros.calciumPer100g = '52';
    const updated = applyNutritionForm(
        { ...oats, unavailableMicronutrients: ['calciumPer100g' as const] },
        form,
    );
    expect(updated).toMatchObject({
        ingredientId: 'oats-id',
        caloriesPer100g: 400,
        fatPer100g: undefined,
        ironPer100g: undefined,
        calciumPer100g: 52,
        zincPer100g: 0,
        unavailableMicronutrients: ['ironPer100g'],
    });
});

it('drops the unavailable list when nothing is unavailable', () => {
    expect(
        applyNutritionForm(oats, nutritionForm(oats)).unavailableMicronutrients,
    ).toBeUndefined();
});

it('builds the ingredient from a picked food without the old match data', () => {
    const picked = ingredientFromFood(
        {
            fdcId: 2,
            name: 'Oats, steel cut',
            description: 'Oats, steel cut',
            per100g: { kcal: 379, proteinG: 13, carbsG: 68, fatG: 6.5 },
        },
        oats,
        'oats-id',
    );
    expect(picked).toMatchObject({
        name: 'oats',
        resolvedName: 'Oats, steel cut',
        ingredientId: 'oats-id',
        preparationTips: ['Soak overnight'],
        caloriesPer100g: 379,
        nutritionSource: { fdcId: 2 },
    });
    expect(picked).not.toHaveProperty('ironPer100g');
    expect(picked.unavailableMicronutrients).toContain('ironPer100g');
});

it('uses a fallback for errors without a message', () => {
    expect(errorMessage(new Error('Offline'), 'Try again')).toBe('Offline');
    expect(errorMessage('nope', 'Try again')).toBe('Try again');
    expect(errorMessage(new Error(''), 'Try again')).toBe('Try again');
});
