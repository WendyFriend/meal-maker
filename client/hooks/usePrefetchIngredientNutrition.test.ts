import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
} from '../services/micronutrientService';
import {
    PREFETCH_DELAY_MS,
    usePrefetchIngredientNutrition,
} from './usePrefetchIngredientNutrition';

vi.mock('../services/micronutrientService', () => ({
    getCachedIngredientNutrition: vi.fn(),
    getIngredientNutrition: vi.fn(),
}));

beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getCachedIngredientNutrition).mockReturnValue(undefined);
    vi.mocked(getIngredientNutrition).mockResolvedValue({ name: 'x' });
});
afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

it('looks up the name once typing pauses', () => {
    const { rerender } = renderHook(
        ({ name }) => usePrefetchIngredientNutrition(name, true),
        { initialProps: { name: 'red' } },
    );
    vi.advanceTimersByTime(PREFETCH_DELAY_MS - 1);
    rerender({ name: 'red ' });
    // Mid-phrase: another word is coming.
    vi.advanceTimersByTime(PREFETCH_DELAY_MS * 2);
    rerender({ name: '  red lentils' });
    vi.advanceTimersByTime(PREFETCH_DELAY_MS - 1);
    expect(getIngredientNutrition).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(getIngredientNutrition).toHaveBeenCalledExactlyOnceWith(
        'red lentils',
    );
});

it('skips short, cached or disabled names', () => {
    vi.mocked(getCachedIngredientNutrition).mockImplementation((name) =>
        name === 'tofu' ? { name } : undefined,
    );
    renderHook(() => usePrefetchIngredientNutrition('ok', true));
    renderHook(() => usePrefetchIngredientNutrition('tofu', true));
    renderHook(() => usePrefetchIngredientNutrition('lentils', false));
    vi.advanceTimersByTime(PREFETCH_DELAY_MS * 2);
    expect(getIngredientNutrition).not.toHaveBeenCalled();
});

it('ignores a failed prefetch', async () => {
    vi.mocked(getIngredientNutrition).mockRejectedValue(new Error('offline'));
    renderHook(() => usePrefetchIngredientNutrition('lentils', true));
    await vi.advanceTimersByTimeAsync(PREFETCH_DELAY_MS);
    expect(getIngredientNutrition).toHaveBeenCalledOnce();
});
