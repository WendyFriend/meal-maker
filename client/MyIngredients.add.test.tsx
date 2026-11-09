import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MyIngredients from './MyIngredients';
import { searchNutritionLabFoods } from './services/foodSearchService';
import type { IngredientInfo } from '../shared/types/types';
import { mockPickerEnvironment } from './test/pickerEnvironment';

vi.mock('./services/foodSearchService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./services/foodSearchService')>()),
    searchNutritionLabFoods: vi.fn(),
}));

beforeEach(() => {
    mockPickerEnvironment();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
    });
});

function setup() {
    const onAdd = vi.fn();
    const onSaveFromDatabase = vi.fn(async (ingredient: IngredientInfo) => ({
        ingredientId: `saved-${ingredient.name}`,
        name: ingredient.name,
        caloriesPer100g: ingredient.caloriesPer100g ?? 0,
        proteinPer100g: ingredient.proteinPer100g ?? 0,
        carbohydratePer100g: ingredient.carbohydratePer100g ?? 0,
        fatPer100g: ingredient.fatPer100g ?? 0,
    }));
    const onDeleteMany = vi.fn(async (ids: string[]) => ids);
    render(
        <MyIngredients
            ingredients={[]}
            onAdd={onAdd}
            onSaveFromDatabase={onSaveFromDatabase}
            onOpen={vi.fn()}
            onDeleteMany={onDeleteMany}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    return { onAdd, onSaveFromDatabase, onDeleteMany };
}

it('offers four add methods and lets the user close the sheet', () => {
    setup();
    for (const name of [
        'Search from database',
        'Take a photo',
        'Scan nutrition label',
        'Enter manually',
    ]) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(
        screen.getByRole('button', { name: 'Close add ingredient' }),
    );
    expect(
        screen.queryByRole('dialog', { name: 'Add Ingredient' }),
    ).not.toBeInTheDocument();
});

it('shows matching ingredients and confirms one was added without closing search', async () => {
    const result = {
        name: 'Broccoli',
        caloriesPer100g: 34,
        proteinPer100g: 2.8,
        carbohydratePer100g: 6.6,
        fatPer100g: 0.4,
        nutritionSource: { fdcId: 170379, description: 'Broccoli, raw' },
    };
    vi.mocked(searchNutritionLabFoods).mockResolvedValue([
        {
            fdcId: 170379,
            name: 'Broccoli',
            description: 'Broccoli, raw',
            per100g: { kcal: 34, proteinG: 2.8, carbsG: 6.6, fatG: 0.4 },
        },
        {
            fdcId: 170380,
            name: 'Broccolini',
            description: 'Broccolini, raw',
            per100g: { kcal: 30, proteinG: 2.5, carbsG: 5, fatG: 0.3 },
        },
    ]);
    const { onAdd, onSaveFromDatabase, onDeleteMany } = setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Search from database' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Search ingredients' });
    expect(within(dialog).getByText('Tomato')).toBeInTheDocument();
    fireEvent.change(
        within(dialog).getByRole('searchbox', { name: 'Search ingredients' }),
        {
            target: { value: 'broc' },
        },
    );
    expect(
        screen.queryByRole('status', { name: 'Searching ingredients' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Broccolini')).toBeInTheDocument();
    expect(searchNutritionLabFoods).toHaveBeenCalledWith(
        'broc',
        expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Broccoli' }));
    await waitFor(() =>
        expect(onSaveFromDatabase).toHaveBeenCalledExactlyOnceWith(result),
    );
    const saved = screen.getByRole('button', {
        name: 'Remove Broccoli from My Ingredients',
    });
    expect(saved).toBeEnabled();
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Broccoli added');
    fireEvent.click(saved);
    await waitFor(() =>
        expect(onDeleteMany).toHaveBeenCalledWith(['saved-Broccoli']),
    );
    expect(
        screen.getByRole('button', { name: 'Add Broccoli' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Broccoli removed');
    expect(
        screen.getByRole('dialog', { name: 'Search ingredients' }),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
});

it('waits before showing the spinner for a slow search', async () => {
    vi.mocked(searchNutritionLabFoods).mockImplementation(
        () => new Promise(() => {}),
    );
    setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Search from database' }),
    );
    fireEvent.change(
        within(
            screen.getByRole('dialog', { name: 'Search ingredients' }),
        ).getByRole('searchbox'),
        { target: { value: 'quinoa' } },
    );
    expect(
        screen.queryByRole('status', { name: 'Searching ingredients' }),
    ).not.toBeInTheDocument();
    expect(
        await screen.findByRole('status', { name: 'Searching ingredients' }),
    ).toBeInTheDocument();
    expect(searchNutritionLabFoods).toHaveBeenCalledOnce();
});

it('keeps an ingredient available when saving fails', async () => {
    const { onSaveFromDatabase } = setup();
    onSaveFromDatabase.mockRejectedValueOnce(new Error('Database unavailable'));
    fireEvent.click(
        screen.getByRole('button', { name: 'Search from database' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Tomato' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't save Tomato.",
    );
    expect(screen.getByRole('button', { name: 'Add Tomato' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onSaveFromDatabase).toHaveBeenCalledTimes(2));
    expect(
        screen.getByRole('button', {
            name: 'Remove Tomato from My Ingredients',
        }),
    ).toBeEnabled();
});

it('shows the saved state immediately while an ingredient is being added', () => {
    const { onSaveFromDatabase } = setup();
    onSaveFromDatabase.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(
        screen.getByRole('button', { name: 'Search from database' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Tomato' }));
    const button = screen.getByRole('button', { name: 'Adding Tomato' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(button.querySelector('.loading-spinner')).toBeInTheDocument();
    expect(button).not.toHaveTextContent('…');
    expect(screen.getByRole('button', { name: 'Add Carrots' })).toBeEnabled();
});

it('shows the add state immediately while a saved ingredient is being removed', async () => {
    const { onDeleteMany } = setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Search from database' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Tomato' }));
    const selected = await screen.findByRole('button', {
        name: 'Remove Tomato from My Ingredients',
    });
    onDeleteMany.mockImplementationOnce(() => new Promise<string[]>(() => {}));
    fireEvent.click(selected);
    const button = screen.getByRole('button', { name: 'Removing Tomato' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('+');
    expect(screen.getByRole('button', { name: 'Add Carrots' })).toBeEnabled();
});

it('keeps the checkmark and offers retry when removing fails', async () => {
    const { onDeleteMany } = setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Search from database' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Tomato' }));
    const selected = await screen.findByRole('button', {
        name: 'Remove Tomato from My Ingredients',
    });
    onDeleteMany.mockRejectedValueOnce(new Error('Database unavailable'));
    fireEvent.click(selected);
    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't remove Tomato.",
    );
    expect(
        screen.getByRole('button', {
            name: 'Remove Tomato from My Ingredients',
        }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onDeleteMany).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Add Tomato' })).toBeEnabled();
});

it('opens the nutrition-label camera with an honest fallback when unavailable', () => {
    setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Scan nutrition label' }),
    );
    expect(
        screen.getByRole('dialog', { name: 'Scan Nutrition Label' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Camera unavailable/)).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Choose photo from library' }),
    ).toBeInTheDocument();
    fireEvent.click(
        screen.getByRole('button', { name: 'Back to My Ingredients' }),
    );
    expect(
        screen.queryByRole('dialog', { name: 'Scan Nutrition Label' }),
    ).not.toBeInTheDocument();
});

it('opens the food camera from Take a photo', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(
        screen.getByRole('dialog', { name: 'Take a photo' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Capture photo' }),
    ).toBeDisabled();
});

it('passes a selected label photo to the editor as a reference', async () => {
    const { onAdd } = setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Scan nutrition label' }),
    );
    fireEvent.change(screen.getByLabelText('Choose ingredient photo'), {
        target: {
            files: [new File(['label'], 'label.png', { type: 'image/png' })],
        },
    });
    fireEvent.click(
        await screen.findByRole('button', { name: 'Enter details' }),
    );
    expect(onAdd).toHaveBeenCalledWith(
        undefined,
        expect.stringMatching(/^data:image\/png;base64,/),
    );
});

it('releases the camera when the scanner closes', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
        getTracks: () => [{ stop }],
        getVideoTracks: () => [{ getCapabilities: () => ({}) }],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    setup();
    fireEvent.click(
        screen.getByRole('button', { name: 'Scan nutrition label' }),
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    fireEvent.click(
        screen.getByRole('button', { name: 'Back to My Ingredients' }),
    );
    expect(stop).toHaveBeenCalledOnce();
});
