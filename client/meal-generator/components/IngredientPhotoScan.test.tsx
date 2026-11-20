import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import IngredientInput from './IngredientInput';
import SelectedIngredients from './SelectedIngredients';
import { prunePhotos, type MealPhoto } from '../mealPhotos';
import { scanIngredientsPhoto } from '../../services/nutritionPhotoService';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';

vi.mock('../../services/nutritionPhotoService', () => ({
    scanIngredientsPhoto: vi.fn(),
    shrinkPhoto: vi.fn(async () => 'data:image/jpeg;base64,thumb'),
}));
vi.mock('../../components/IngredientCamera', () => ({
    default: ({ onContinue }: { onContinue: (photo: string) => void }) => (
        <button
            type="button"
            onClick={() => onContinue('data:image/jpeg;base64,x')}
        >
            Use test photo
        </button>
    ),
}));

const onNutrition = vi.fn();

function Fixture({ initial = ['Tofu'] }: { initial?: string[] }) {
    const [ingredients, setIngredients] = useState(initial);
    return (
        <>
            <IngredientInput
                ingredients={ingredients}
                savedIngredients={[]}
                onChange={setIngredients}
                onIngredientNutritionSelected={onNutrition}
            />
            <output aria-label="Chips">{ingredients.join(', ')}</output>
        </>
    );
}

const tomato = {
    fdcId: 1,
    name: 'Tomatoes, raw',
    description: 'Tomatoes, red, ripe, raw',
    per100g: { kcal: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2 },
};

beforeEach(() => {
    mockPickerEnvironment();
    onNutrition.mockReset();
});

it('adds the foods found in a photo as chips, with their nutrition', async () => {
    vi.mocked(scanIngredientsPhoto).mockResolvedValue([
        { name: 'tomato', food: tomato },
        { name: 'tofu', food: null },
        { name: 'basil', food: null },
    ]);
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));

    expect(await screen.findByText('2 ingredients added.')).toBeVisible();
    expect(screen.getByText('Tomato, basil')).toBeVisible();
    // Tofu was already there, so it is not added twice.
    expect(screen.getByLabelText('Chips')).toHaveTextContent(
        'Tofu, tomato, basil',
    );
    expect(onNutrition).toHaveBeenCalledWith(
        'tomato',
        expect.objectContaining({ caloriesPer100g: 18 }),
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Chips')).toHaveTextContent(/^Tofu$/);
    expect(screen.queryByText('2 ingredients added.')).not.toBeInTheDocument();
});

it('says why nothing was added when the scan fails', async () => {
    vi.mocked(scanIngredientsPhoto).mockRejectedValue(
        new Error('Couldn’t find any foods. Try a closer photo.'),
    );
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));

    expect(
        await screen.findByText('Couldn’t find any foods. Try a closer photo.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Chips')).toHaveTextContent(/^Tofu$/);
    expect(screen.getByRole('button', { name: 'Photo' })).toBeEnabled();
});

function PhotoFixture({ onOpenPhoto }: { onOpenPhoto?: (id: string) => void }) {
    const [ingredients, setIngredients] = useState(['Tofu']);
    const [photos, setPhotos] = useState<MealPhoto[]>([]);
    const change = (next: string[]) => {
        setIngredients(next);
        setPhotos((shown) => prunePhotos(shown, next));
    };
    return (
        <>
            <IngredientInput
                ingredients={ingredients}
                savedIngredients={[]}
                onChange={change}
                onPhotosChange={setPhotos}
            />
            <SelectedIngredients
                ingredients={ingredients}
                photos={photos}
                onOpenPhoto={onOpenPhoto}
                onRemovePhoto={(id) => {
                    const photo = photos.find((shown) => shown.id === id);
                    setPhotos((shown) => shown.filter((p) => p.id !== id));
                    change(
                        ingredients.filter(
                            (name) => !photo?.ingredients.includes(name),
                        ),
                    );
                }}
                removeIngredient={(name) =>
                    change(ingredients.filter((item) => item !== name))
                }
                onIngredientClick={() => {}}
                onClear={() => change([])}
            />
            <output aria-label="Chips">{ingredients.join(', ')}</output>
        </>
    );
}

it('shows the photo in place of the foods found in it', async () => {
    let finish: (found: { name: string; food: null }[]) => void = () => {};
    vi.mocked(scanIngredientsPhoto).mockReturnValue(
        new Promise((resolve) => (finish = resolve)),
    );
    const onOpenPhoto = vi.fn();
    const user = userEvent.setup();
    render(<PhotoFixture onOpenPhoto={onOpenPhoto} />);
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));

    // Shown at once, while it is read.
    expect(
        await screen.findByRole('img', { name: 'Photo being read' }),
    ).toBeVisible();
    finish([
        { name: 'tomato', food: null },
        { name: 'basil', food: null },
    ]);
    const photo = await screen.findByRole('button', {
        name: 'Photo, 2 foods',
    });
    expect(photo.querySelector('img')).toHaveAttribute(
        'src',
        'data:image/jpeg;base64,thumb',
    );
    // Its foods are in the meal but not shown as chips.
    expect(screen.getByLabelText('Chips')).toHaveTextContent(
        'Tofu, tomato, basil',
    );
    const chips = screen.getByRole('group', {
        name: 'Selected ingredient list',
    });
    expect(chips).toHaveTextContent('Tofu');
    expect(chips).not.toHaveTextContent('tomato');

    await user.click(photo);
    expect(onOpenPhoto).toHaveBeenCalled();

    // Its corner ✕ removes it with its foods, like a chip (here without
    // the animation, as with reduced motion).
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
        ...matchMedia(query),
        matches: query === '(prefers-reduced-motion: reduce)',
    })) as typeof window.matchMedia;
    await user.click(
        screen.getByRole('button', { name: 'Remove photo and its 2 foods' }),
    );
    window.matchMedia = matchMedia;
    expect(photo).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chips')).toHaveTextContent(/^Tofu$/);
});

it('drops the photo when nothing new was found', async () => {
    vi.mocked(scanIngredientsPhoto).mockResolvedValue([
        { name: 'tofu', food: null },
    ]);
    const user = userEvent.setup();
    render(<PhotoFixture />);
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));
    expect(
        await screen.findByText('Already in your ingredients.'),
    ).toBeVisible();
    expect(
        screen.queryByRole('img', { name: /^Photo/ }),
    ).not.toBeInTheDocument();
});
