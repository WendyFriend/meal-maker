// Tests for the "Speak your ingredients" panel.
//
// The panel resolves what was said or typed after a pause and builds a list;
// nothing is generated until "Create my meal" is pressed. These tests pin that,
// and that stated amounts and match confidence reach the list and the caller.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import SpeakIngredients from './SpeakIngredients';
import { parseRecipe } from '../../services/parseRecipeService';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';

vi.mock('../../services/parseRecipeService', () => ({
    parseRecipe: vi.fn(),
}));

// jsdom has no MediaRecorder, so the hook reports the mic unsupported and the
// panel falls back to typing. That is the path under test.
const parsed = {
    ingredients: [
        {
            said: 'tofu',
            match: {
                name: 'Tofu, raw, regular',
                caloriesPer100g: 76,
                proteinPer100g: 8,
                carbohydratePer100g: 1.9,
                fatPer100g: 4.8,
                fdcId: 1,
                description: 'Tofu, raw, regular',
            },
            alternatives: [],
            confidence: 'confident' as const,
            quantity: { amount: 500, unit: 'kcal' as const },
            certainty: { p: 0.93, band: 'very likely' },
        },
        {
            said: 'rice',
            match: {
                name: 'Rice, white, raw',
                caloriesPer100g: 365,
                proteinPer100g: 7.1,
                carbohydratePer100g: 80,
                fatPer100g: 0.7,
                fdcId: 2,
                description: 'Rice, white, raw',
            },
            alternatives: [],
            confidence: 'probable' as const,
            quantity: { amount: 100, unit: 'g' as const },
            certainty: { p: 0.41, band: 'unsure' },
        },
    ],
    targets: [{ nutrient: 'protein' as const, amount: 40, unit: 'g' as const }],
    mealPeriod: null,
    usedModel: false,
};

beforeEach(() => {
    // The panel picks its placeholder from a media query, which jsdom does not
    // implement. The repo helper stubs it (and the dialog/scroll APIs).
    mockPickerEnvironment();
    vi.mocked(parseRecipe).mockResolvedValue({ ok: true, data: parsed });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it('resolves after a pause but does not generate on its own', async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={onUse} />);

    await user.type(screen.getByLabelText('Ingredients to use'), '500 calories of tofu and 100g rice');

    expect(await screen.findByText('Tofu, raw, regular', undefined, { timeout: 3000 })).toBeInTheDocument();
    // Typed in one go, so resolved once, with the whole sentence.
    expect(parseRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(parseRecipe).mock.calls[0][0]).toBe('500 calories of tofu and 100g rice');
    expect(onUse).not.toHaveBeenCalled();
});

it('waits for a 1.5 second pause before resolving', async () => {
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={vi.fn()} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'tofu');
    await sleep(1000);
    expect(parseRecipe).not.toHaveBeenCalled();

    await waitFor(() => expect(parseRecipe).toHaveBeenCalledTimes(1), { timeout: 2000 });
});

it('shows each amount as a tag and the match confidence', async () => {
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={vi.fn()} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'tofu{Enter}');

    expect(await screen.findByText('500 kcal')).toBeInTheDocument();
    expect(screen.getByText('100 g')).toBeInTheDocument();
    expect(screen.getByText('93%')).toHaveClass('is-high');
    expect(screen.getByText('41%')).toHaveClass('is-low');
    expect(screen.getByText('40 g protein')).toBeInTheDocument();
});

it('generates with fixed amounts and goals when "Create my meal" is pressed', async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={onUse} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'tofu{Enter}');
    await screen.findByText('Tofu, raw, regular');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
    const [ingredients, targets] = onUse.mock.calls[0];
    expect(ingredients).toHaveLength(2);
    expect(ingredients[0]).toMatchObject({ name: 'Tofu, raw, regular', fixedAmount: { amount: 500, unit: 'kcal' } });
    expect(ingredients[1]).toMatchObject({ name: 'Rice, white, raw', fixedAmount: { amount: 100, unit: 'g' } });
    expect(targets).toEqual([{ nutrient: 'protein', amount: 40, unit: 'g' }]);
});

it('resolves unfinished text when "Create my meal" is pressed straight away', async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={onUse} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'tofu');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
    expect(onUse.mock.calls[0][0]).toHaveLength(2);
});

it('adds batches together', async () => {
    vi.mocked(parseRecipe)
        .mockResolvedValueOnce({ ok: true, data: { ...parsed, ingredients: [parsed.ingredients[0]] } })
        .mockResolvedValueOnce({ ok: true, data: { ...parsed, ingredients: [parsed.ingredients[1]], targets: [] } });
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={vi.fn()} />);
    const field = screen.getByLabelText('Ingredients to use');

    await user.type(field, 'tofu{Enter}');
    await screen.findByText('Tofu, raw, regular');
    await user.type(field, 'rice{Enter}');
    await screen.findByText('Rice, white, raw');

    expect(screen.getByText('Tofu, raw, regular')).toBeInTheDocument();
    expect(field).toHaveValue('');
});

it('lets an ingredient be removed', async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={onUse} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'tofu{Enter}');
    await screen.findByText('Tofu, raw, regular');
    await user.click(screen.getByRole('button', { name: 'Remove Tofu, raw, regular' }));
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
    expect(onUse.mock.calls[0][0]).toHaveLength(1);
    expect(onUse.mock.calls[0][0][0].name).toBe('Rice, white, raw');
});

it('does nothing for a single character', async () => {
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={vi.fn()} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 't');
    await sleep(1800);

    expect(parseRecipe).not.toHaveBeenCalled();
});

it('reports a failure', async () => {
    vi.mocked(parseRecipe).mockResolvedValue({ ok: false, message: 'Nope.' });
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={onUse} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'zzzz');

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('Nope.');
    expect(onUse).not.toHaveBeenCalled();
});

it('says so when nothing matched the database', async () => {
    vi.mocked(parseRecipe).mockResolvedValue({
        ok: true,
        data: { ingredients: [], targets: [], mealPeriod: null, usedModel: false },
    });
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={vi.fn()} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'zzzz');

    expect(
        await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent(/Nothing in there matched/i);
});

it('passes the spoken meal period through to the caller', async () => {
    vi.mocked(parseRecipe).mockResolvedValue({
        ok: true,
        data: { ...parsed, mealPeriod: { mealType: 'dinner', said: 'supper' } },
    });
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<SpeakIngredients onUse={onUse} />);

    await user.type(screen.getByLabelText('Ingredients to use'), 'tofu for supper{Enter}');
    await screen.findByText('Tofu, raw, regular');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
    const [, , mealPeriod] = onUse.mock.calls[0];
    expect(mealPeriod).toEqual({ mealType: 'dinner', said: 'supper' });
});

it('shows progress while the caller is generating', () => {
    render(<SpeakIngredients onUse={vi.fn()} isGenerating />);

    expect(screen.getByRole('status')).toHaveTextContent('Writing your recipe');
});
