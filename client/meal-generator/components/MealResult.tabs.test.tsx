import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateMealResponse } from '../../../shared/types/types';
import { deleteRecipe, saveRecipe } from '../../services/recipeService';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import MealResult from './MealResult';

vi.mock('../../services/recipeService', () => ({
    saveRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
}));

vi.mock('../../hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));

afterEach(() => vi.unstubAllGlobals());

const meal: GenerateMealResponse = {
    mealName: 'Garlic tofu bowl',
    ingredients: [
        {
            name: 'Tofu',
            weight: 200,
            caloriesPer100g: 130,
            proteinPer100g: 15,
            carbohydratePer100g: 5,
            fatPer100g: 4,
            fiberPer100g: 2,
        },
    ],
    instructions: ['Cook: Sear the tofu.'],
};

describe('meal result detail layout', () => {
    it('reveals an X on a left swipe and animates the ingredient away', async () => {
        vi.stubGlobal('PointerEvent', MouseEvent);
        mockPickerEnvironment();
        const onChange = vi.fn();
        render(<MealResult meal={meal} onChange={onChange} />);
        const row = document.querySelector('.meal-ingredient-swipe-content')!;

        fireEvent.pointerDown(row, { pointerId: 1, clientX: 180, clientY: 30 });
        fireEvent.pointerMove(row, { pointerId: 1, clientX: 175, clientY: 85 });
        fireEvent.pointerUp(row, { pointerId: 1, clientX: 175, clientY: 85 });
        expect(
            screen.queryByRole('button', { name: 'Remove Tofu' }),
        ).not.toBeInTheDocument();

        fireEvent.pointerDown(row, { pointerId: 1, clientX: 180, clientY: 30 });
        fireEvent.pointerMove(row, { pointerId: 1, clientX: 95, clientY: 32 });
        fireEvent.pointerUp(row, { pointerId: 1, clientX: 95, clientY: 32 });

        const remove = screen.getByRole('button', { name: 'Remove Tofu' });
        expect(remove).toHaveTextContent('');
        expect(remove.querySelector('svg')).not.toBeNull();
        fireEvent.click(remove);
        expect(row.parentElement).toHaveAttribute('data-removing', 'true');
        expect(onChange).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({
                ...meal,
                ingredients: [],
            }),
        );
    });

    it('removes immediately when reduced motion is preferred', () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
        const onChange = vi.fn();
        render(<MealResult meal={meal} onChange={onChange} />);

        fireEvent.keyDown(document.querySelector('.meal-ingredient-swipe')!, {
            key: 'Delete',
        });

        expect(onChange).toHaveBeenCalledWith({
            ...meal,
            ingredients: [],
        });
    });

    it('notifies the saved list after bookmarking and unbookmarking', async () => {
        const onSavedRecipesChange = vi.fn();
        vi.mocked(saveRecipe).mockResolvedValue({
            id: 'saved-meal',
            userId: 'user',
            recipeName: meal.mealName,
            ingredients: meal.ingredients,
            instructions: meal.instructions,
        });
        vi.mocked(deleteRecipe).mockResolvedValue({
            id: 'saved-meal',
            userId: 'user',
            recipeName: meal.mealName,
            ingredients: meal.ingredients,
            instructions: meal.instructions,
        });
        render(
            <MealResult
                meal={meal}
                onChange={vi.fn()}
                onSavedRecipesChange={onSavedRecipesChange}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Save this meal' }));
        await waitFor(() =>
            expect(onSavedRecipesChange).toHaveBeenCalledOnce(),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove this meal from saved' }),
        );
        await waitFor(() =>
            expect(onSavedRecipesChange).toHaveBeenCalledTimes(2),
        );
    });

    it('shows calories, protein, fiber, actions, and switches between both tabs', () => {
        render(<MealResult meal={meal} onChange={vi.fn()} />);
        const summary = document.querySelector('.meal-result-highlights')!;
        expect(
            within(summary as HTMLElement).getByText('~260 kcal'),
        ).toBeInTheDocument();
        expect(
            within(summary as HTMLElement).getByText('~30 g'),
        ).toBeInTheDocument();
        expect(
            within(summary as HTMLElement).getByText('~4 g'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save this meal' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add to My Plan' }),
        ).toBeInTheDocument();

        const nutrition = screen.getByRole('tab', {
            name: 'Ingredients & Nutrition',
        });
        const steps = screen.getByRole('tab', { name: 'Steps' });
        expect(nutrition).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.getByRole('heading', { name: 'Nutrition' }),
        ).toBeVisible();
        fireEvent.click(steps);
        expect(steps).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Sear the tofu.')).toBeVisible();
        expect(
            screen.queryByRole('heading', { name: 'Nutrition' }),
        ).not.toBeInTheDocument();
        fireEvent.keyDown(steps, { key: 'ArrowLeft' });
        expect(nutrition).toHaveFocus();
        expect(nutrition).toHaveAttribute('aria-selected', 'true');
    });

    it('marks fiber as unavailable when any ingredient is missing fiber data', () => {
        render(
            <MealResult
                meal={{
                    ...meal,
                    ingredients: [
                        meal.ingredients[0],
                        {
                            ...meal.ingredients[0],
                            name: 'Broccoli',
                            fiberPer100g: undefined,
                        },
                    ],
                }}
                onChange={vi.fn()}
            />,
        );
        expect(
            document.querySelector('.meal-result-highlights'),
        ).toHaveTextContent('—Fiber');
    });
});
