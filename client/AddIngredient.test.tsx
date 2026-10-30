import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddIngredient from './AddIngredient';

vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));

function setup(existing?: string, fail = false) {
    const onSave = vi.fn(async () => {
        if (fail) throw new Error('offline');
    });
    const onBack = vi.fn();
    render(
        <>
            <button type="reset" form="ingredient-detail-form">
                ✕
            </button>
            <button type="submit" form="ingredient-detail-form">
                ✓
            </button>
            <AddIngredient
                onBack={onBack}
                onSave={onSave}
                findExistingIngredient={() => existing}
                onEditorStateChange={vi.fn()}
            />
        </>,
    );
    return { user: userEvent.setup(), onSave, onBack };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
        screen.getByRole('textbox', { name: 'Ingredient name' }),
        'Chickpeas',
    );
    for (const [label, value] of [
        ['Calories', '164'],
        ['Protein', '8.9'],
        ['Total fat', '2.6'],
        ['Carbohydrate', '27.4'],
    ]) {
        await user.type(
            screen.getByRole('spinbutton', { name: `${label} per 100 grams` }),
            value,
        );
    }
}

describe('Add ingredient shared editor', () => {
    it('requires name and the four macros while other values remain optional', async () => {
        const { user, onSave, onBack } = setup();
        expect(
            screen.getByRole('textbox', { name: 'Ingredient name' }),
        ).toBeRequired();
        expect(
            screen.getAllByText('*', {
                selector: '.ingredient-required-marker',
            }),
        ).toHaveLength(5);
        for (const label of [
            'Calories',
            'Protein',
            'Total fat',
            'Carbohydrate',
        ]) {
            expect(
                screen.getByRole('rowheader', { name: label }).textContent,
            ).toContain('*');
        }
        for (const label of [
            'Calories',
            'Protein',
            'Total fat',
            'Carbohydrate',
        ]) {
            const input = screen.getByRole('spinbutton', {
                name: `${label} per 100 grams`,
            });
            expect(input).toBeRequired();
            expect(input).toHaveValue(null);
        }
        expect(
            screen.getByRole('spinbutton', {
                name: 'Saturated fat per 100 grams',
            }),
        ).not.toBeRequired();
        expect(
            screen.getByRole('spinbutton', { name: 'Iron per 100 g (mg)' }),
        ).not.toBeRequired();
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(onSave).not.toHaveBeenCalled();
        await fillRequired(user);
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Chickpeas',
                caloriesPer100g: 164,
                proteinPer100g: 8.9,
                fatPer100g: 2.6,
                carbohydratePer100g: 27.4,
                sugarPer100g: undefined,
                preparationTips: undefined,
            }),
        );
        expect(
            await screen.findByRole('status', { name: 'Ingredient saved' }),
        ).toBeInTheDocument();
        await waitFor(() => expect(onBack).toHaveBeenCalledOnce(), {
            timeout: 1500,
        });
    });

    it('saves optional micronutrients and preparation tips through the header tick', async () => {
        const { user, onSave } = setup();
        await fillRequired(user);
        await user.type(
            screen.getByRole('spinbutton', { name: 'Iron per 100 g (mg)' }),
            '2.9',
        );
        await user.type(
            screen.getByRole('textbox', { name: 'One tip per line' }),
            'Rinse before cooking.',
        );
        await user.click(screen.getByRole('button', { name: '✓' }));
        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    ironPer100g: 2.9,
                    preparationTips: ['Rinse before cooking.'],
                }),
            ),
        );
    });

    it('prevents duplicates and lets the cross cancel without saving', async () => {
        const { user, onSave, onBack } = setup('Chickpeas');
        await fillRequired(user);
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'already in your ingredients',
        );
        expect(onSave).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '✕' }));
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('keeps entered values available after a failed save', async () => {
        const { user } = setup(undefined, true);
        await fillRequired(user);
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not save',
        );
        expect(
            screen.getByRole('textbox', { name: 'Ingredient name' }),
        ).toHaveValue('Chickpeas');
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
});
