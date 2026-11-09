import { expect, it } from 'vitest';
import { describeIngredientSaveError } from './ingredientSaveError';

it('offers a list refresh for a duplicate saved elsewhere', () => {
    expect(
        describeIngredientSaveError(
            { code: '23505', message: 'duplicate key' },
            'Tomato',
        ),
    ).toMatchObject({
        message: 'Tomato is already in My Ingredients.',
        action: 'refresh',
        diagnostic: '23505: duplicate key',
    });
});

it('explains session and connection failures', () => {
    expect(
        describeIngredientSaveError({ httpStatus: 401 }, 'Tofu'),
    ).toMatchObject({
        action: 'none',
        message: expect.stringContaining('Sign in again'),
    });
    expect(
        describeIngredientSaveError(new TypeError('Failed to fetch'), 'Tofu'),
    ).toMatchObject({
        action: 'retry',
        message: expect.stringContaining('Check your connection'),
    });
});

it('uses the removal action in a failed delete message', () => {
    expect(
        describeIngredientSaveError(
            new Error('Database unavailable'),
            'Tomato',
            'remove',
        ),
    ).toMatchObject({ message: "Couldn't remove Tomato.", action: 'retry' });
});
