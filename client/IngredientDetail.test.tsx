import type { DetailEditorHandle } from './components/DetailEditorHandle';
import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import IngredientDetail from './IngredientDetail';
import type { UserIngredient } from '../shared/types/types';

vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: { tofu: { ironPer100g: 2 } },
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));

const original: UserIngredient = {
    ingredientId: 'tofu',
    name: 'Tofu',
    caloriesPer100g: 130,
    proteinPer100g: 15,
    carbohydratePer100g: 5.6,
    fatPer100g: 4,
};

function setup(
    onUpdate = vi
        .fn<(id: string, value: UserIngredient) => Promise<void>>()
        .mockResolvedValue(undefined),
) {
    function Fixture() {
        const ref = useRef<DetailEditorHandle>(null);
        const [ingredient, setIngredient] = useState(original);
        const [editor, setEditor] = useState({ editing: false, saving: false });
        return (
            <>
                {!editor.editing && (
                    <button
                        type="button"
                        aria-label="Edit ingredient"
                        onClick={() => ref.current?.edit()}
                    >
                        Edit
                    </button>
                )}
                {editor.editing && (
                    <header>
                        <button
                            type="reset"
                            form="ingredient-detail-form"
                            disabled={editor.saving}
                        >
                            ✕
                        </button>
                        <button
                            type="submit"
                            form="ingredient-detail-form"
                            disabled={editor.saving}
                        >
                            ✓
                        </button>
                    </header>
                )}
                <IngredientDetail
                    ref={ref}
                    ingredient={ingredient}
                    onEditorStateChange={setEditor}
                    onUpdate={async (id, value) => {
                        await onUpdate(id, value);
                        setIngredient(value);
                    }}
                />
            </>
        );
    }
    render(<Fixture />);
    return { user: userEvent.setup(), onUpdate };
}

describe('Ingredient detail header editing', () => {
    it('discards edits using the external cancel control', async () => {
        const { user, onUpdate } = setup();
        await user.click(
            screen.getByRole('button', { name: 'Edit ingredient' }),
        );
        const name = screen.getByRole('textbox', { name: /ingredient name/i });
        await user.clear(name);
        await user.type(name, 'Changed tofu');
        expect(
            screen.queryByRole('button', { name: /save changes|cancel/i }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '✕' }));
        expect(
            screen.getByRole('heading', { name: 'Tofu' }),
        ).toBeInTheDocument();
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it.each(['✓', 'Save'])(
        'saves using %s and returns to updated details',
        async (control) => {
            const { user, onUpdate } = setup();
            await user.click(
                screen.getByRole('button', { name: 'Edit ingredient' }),
            );
            const name = screen.getByRole('textbox', {
                name: /ingredient name/i,
            });
            await user.clear(name);
            await user.type(name, 'Firm tofu');
            await user.click(screen.getByRole('button', { name: control }));
            expect(
                await screen.findByRole('heading', { name: 'Firm tofu' }),
            ).toBeInTheDocument();
            expect(onUpdate).toHaveBeenCalledWith(
                'tofu',
                expect.objectContaining({ name: 'Firm tofu' }),
            );
            expect(
                screen.queryByRole('button', { name: control }),
            ).not.toBeInTheDocument();
        },
    );

    it('keeps edits and re-enables header controls if saving fails', async () => {
        const { user } = setup(
            vi.fn(async () => {
                throw new Error('offline');
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Edit ingredient' }),
        );
        await user.click(screen.getByRole('button', { name: '✓' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not save',
        );
        await waitFor(() =>
            expect(screen.getByRole('button', { name: '✓' })).toBeEnabled(),
        );
        expect(
            screen.getByRole('textbox', { name: /ingredient name/i }),
        ).toHaveValue('Tofu');
    });
    it('edits vitamins and minerals, updates DV, and preserves zero values', async () => {
        const { user, onUpdate } = setup();
        await user.click(
            screen.getByRole('button', { name: 'Edit ingredient' }),
        );
        const iron = screen.getByRole('spinbutton', {
            name: 'Iron per 100 g (mg)',
        });
        expect(iron).toHaveValue(2);
        await user.clear(iron);
        await user.type(iron, '9');
        expect(
            screen.getByRole('progressbar', {
                name: 'Iron daily value per 100 grams',
            }),
        ).toHaveAttribute('value', '50');
        const b12 = screen.getByRole('spinbutton', {
            name: 'Vitamin B12 per 100 g (µg)',
        });
        await user.type(b12, '0');
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(onUpdate).toHaveBeenCalledWith(
                'tofu',
                expect.objectContaining({
                    ironPer100g: 9,
                    vitaminB12Per100g: 0,
                }),
            ),
        );
        expect(
            screen.queryByRole('spinbutton', { name: /Iron/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('9 mg')).toBeInTheDocument();
    });

    it('discards micronutrient edits on cancel', async () => {
        const { user, onUpdate } = setup();
        await user.click(
            screen.getByRole('button', { name: 'Edit ingredient' }),
        );
        const iron = screen.getByRole('spinbutton', {
            name: 'Iron per 100 g (mg)',
        });
        await user.clear(iron);
        await user.type(iron, '9');
        await user.click(screen.getByRole('button', { name: '✕' }));
        expect(screen.getByText('2 mg')).toBeInTheDocument();
        expect(onUpdate).not.toHaveBeenCalled();
    });
});
