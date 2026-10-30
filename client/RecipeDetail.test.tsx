import type { DetailEditorHandle } from './components/DetailEditorHandle';
import { useRef, useState } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RecipeDetail from './RecipeDetail';
import type { Recipe } from '../shared/types/recipe';
vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));
const recipe: Recipe = {
    id: 'meal-1',
    userId: 'user',
    recipeName: 'Tofu bowl',
    ingredients: [
        {
            name: 'Tofu',
            weight: 100,
            caloriesPer100g: 130,
            proteinPer100g: 15,
            carbohydratePer100g: 5.6,
            fatPer100g: 4,
        },
    ],
    instructions: ['Cook: Stir for 2 minutes.'],
};
function setup(save = vi.fn(async (value: Recipe) => value)) {
    function Fixture() {
        const ref = useRef<DetailEditorHandle>(null);
        const [editor, setEditor] = useState({ editing: false, saving: false });
        return (
            <>
                <header>
                    {editor.editing ? (
                        <>
                            <button
                                type="reset"
                                form="meal-detail-form"
                                disabled={editor.saving}
                                aria-label="Cancel editing"
                            >
                                ✕
                            </button>
                            <button
                                type="submit"
                                form="meal-detail-form"
                                disabled={editor.saving}
                                aria-label="Save meal"
                            >
                                ✓
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            aria-label="Edit meal"
                            onClick={() => ref.current?.edit()}
                        >
                            Edit
                        </button>
                    )}
                </header>
                <RecipeDetail
                    ref={ref}
                    recipe={recipe}
                    onSave={save}
                    onEditorStateChange={setEditor}
                />
            </>
        );
    }
    render(<Fixture />);
    return { user: userEvent.setup(), save };
}
const increase = () =>
    screen.getByRole('button', { name: 'Increase Tofu by 5 grams' });

describe('saved meal header editing', () => {
    it('starts read-only and enables weights and instructions from the header pencil', async () => {
        const { user } = setup();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Increase|Decrease/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit instructions' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('100 g')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        expect(increase()).toBeInTheDocument();
        expect(
            screen.getByRole('textbox', { name: 'Instructions' }),
        ).toHaveValue('Cook: Stir for 2 minutes.');
        expect(
            screen.queryByRole('button', { name: 'Reset instructions' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Cancel editing' }),
        ).toBeInTheDocument();
    });
    it.each(['Save', 'Save meal'])(
        'saves via %s and adopts the saved weights as its reset baseline',
        async (control) => {
            const { user, save } = setup();
            await user.click(screen.getByRole('button', { name: 'Edit meal' }));
            await user.click(increase());
            await user.click(screen.getByRole('button', { name: control }));
            expect(
                await screen.findByRole('button', { name: 'Edit meal' }),
            ).toBeInTheDocument();
            expect(screen.getByText('105 g')).toBeInTheDocument();
            expect(save).toHaveBeenCalledWith(
                expect.objectContaining({
                    ingredients: [expect.objectContaining({ weight: 105 })],
                }),
            );
            await user.click(screen.getByRole('button', { name: 'Edit meal' }));
            await user.click(increase());
            await user.click(
                screen.getByRole('button', {
                    name: 'Reset ingredient weights',
                }),
            );
            expect(
                screen.getByRole('spinbutton', {
                    name: 'Tofu weight in grams',
                }),
            ).toHaveValue(105);
            await user.click(screen.getByRole('button', { name: 'Save meal' }));
            expect(save).toHaveBeenCalledOnce();
        },
    );
    it('cancels weights and instructions, including unfinished numeric drafts', async () => {
        const { user, save } = setup();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        await user.clear(
            screen.getByRole('spinbutton', { name: 'Tofu weight in grams' }),
        );
        await user.clear(screen.getByRole('textbox', { name: 'Instructions' }));
        await user.type(
            screen.getByRole('textbox', { name: 'Instructions' }),
            'Changed step.',
        );
        await user.click(
            screen.getByRole('button', { name: 'Cancel editing' }),
        );
        expect(screen.getByText('100 g')).toBeInTheDocument();
        expect(screen.getByText('Stir for 2 minutes.')).toBeInTheDocument();
        expect(save).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        expect(
            screen.getByRole('spinbutton', { name: 'Tofu weight in grams' }),
        ).toHaveValue(100);
    });
    it('keeps the instruction reset action and resets only instructions', async () => {
        const { user } = setup();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        await user.click(increase());
        const instructions = screen.getByRole('textbox', {
            name: 'Instructions',
        });
        await user.clear(instructions);
        await user.type(instructions, 'New step.');
        await user.click(
            screen.getByRole('button', { name: 'Reset instructions' }),
        );
        expect(instructions).toHaveValue('Cook: Stir for 2 minutes.');
        expect(
            screen.queryByRole('button', { name: 'Edit instructions' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Reset instructions' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('spinbutton', { name: 'Tofu weight in grams' }),
        ).toHaveValue(105);
    });
    it('keeps ingredient reset available even when edited weights return to their original values', async () => {
        const { user } = setup();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        await user.click(increase());
        fireEvent.click(
            screen.getByRole('button', { name: 'Decrease Tofu by 5 grams' }),
        );
        expect(
            screen.getByRole('button', { name: 'Reset ingredient weights' }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Reset ingredient weights' }),
        );
        expect(
            screen.queryByRole('button', { name: 'Reset ingredient weights' }),
        ).not.toBeInTheDocument();
    });
    it('disables editing during saving and keeps failed edits for retry', async () => {
        let reject!: (error: Error) => void;
        const save = vi
            .fn<(value: Recipe) => Promise<Recipe>>()
            .mockImplementationOnce(
                () =>
                    new Promise((_resolve, fail) => {
                        reject = fail;
                    }),
            )
            .mockImplementation(async (value) => value);
        const { user } = setup(save);
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        await user.click(increase());
        await user.click(screen.getByRole('button', { name: 'Save meal' }));
        expect(increase()).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Cancel editing' }),
        ).toBeDisabled();
        await act(async () => reject(new Error('offline')));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not save',
        );
        await user.click(screen.getByRole('button', { name: 'Save meal' }));
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
        expect(save).toHaveBeenCalledTimes(2);
    });
    it('hides My Day actions while editing and persists meal-name changes', async () => {
        const { user, save } = setup();
        expect(
            screen.getByRole('button', { name: 'Add to My Day' }),
        ).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        expect(
            screen.queryByRole('button', { name: 'Add to My Day' }),
        ).not.toBeInTheDocument();
        expect(
            document.querySelector('.meal-result-actions'),
        ).not.toBeInTheDocument();
        const name = screen.getByRole('textbox', { name: 'Meal name' });
        await user.clear(name);
        await user.type(name, '  Crispy tofu bowl  ');
        await user.click(screen.getByRole('button', { name: 'Save meal' }));
        expect(
            await screen.findByRole('heading', { name: 'Crispy tofu bowl' }),
        ).toBeInTheDocument();
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ recipeName: 'Crispy tofu bowl' }),
        );
        expect(
            screen.getByRole('button', { name: 'Add to My Day' }),
        ).toBeEnabled();
    });
    it('discards renamed titles on cancel and rejects a whitespace-only name', async () => {
        const { user, save } = setup();
        await user.click(screen.getByRole('button', { name: 'Edit meal' }));
        const name = screen.getByRole('textbox', { name: 'Meal name' });
        await user.clear(name);
        await user.type(name, '   ');
        await user.click(screen.getByRole('button', { name: 'Save meal' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Enter a meal name',
        );
        expect(save).not.toHaveBeenCalled();
        await user.click(
            screen.getByRole('button', { name: 'Cancel editing' }),
        );
        expect(
            screen.getByRole('heading', { name: 'Tofu bowl' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add to My Day' }),
        ).toBeEnabled();
    });
});
