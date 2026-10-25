import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PLAN_LIMITS } from '../../shared/plans';
import { DEFAULT_PROFILE } from '../../shared/types/profile';
import * as planContext from '../plan/PlanContext';
import Goals from './Goals';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../plan/PlanContext', async (importOriginal) => ({
    ...(await importOriginal<typeof planContext>()),
    usePlan: vi.fn(),
}));

function mockPlan(
    overrides: Partial<ReturnType<typeof planContext.usePlan>> = {},
) {
    const value = {
        profile: DEFAULT_PROFILE,
        isLoading: false,
        tier: 'pro' as const,
        limits: PLAN_LIMITS.pro,
        generationsToday: 0,
        generationsLeft: 100,
        canGenerate: true,
        recordGeneration: vi.fn(),
        updateProfile: vi.fn().mockResolvedValue(undefined),
        startTrial: vi.fn(),
        openPlans: vi.fn(),
        ...overrides,
    };

    vi.mocked(planContext.usePlan).mockReturnValue(value);

    return value as typeof value & { updateProfile: Mock };
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('Goals', () => {
    it('saves edited targets as grams, disabled until changed', async () => {
        const user = userEvent.setup();
        const plan = mockPlan();

        render(<Goals />);

        const save = screen.getByRole('button', { name: 'Save changes' });

        expect(save).toBeDisabled();

        const calories = screen.getByLabelText('Calories');

        await user.clear(calories);
        await user.type(calories, '2400');
        await user.click(screen.getByRole('button', { name: /^High protein/ }));

        // 35% / 35% / 30% of 2,400 kcal
        expect(screen.getByLabelText('Protein')).toHaveValue(210);
        expect(screen.getByLabelText('Carbs')).toHaveValue(210);
        expect(screen.getByLabelText('Fat')).toHaveValue(80);

        await user.click(save);

        expect(plan.updateProfile).toHaveBeenCalledWith({
            targets: {
                calories: 2400,
                proteinG: 210,
                carbsG: 210,
                fatG: 80,
                fiberG: 30,
            },
            mealSlots: DEFAULT_PROFILE.mealSlots,
        });
        expect(await screen.findByText('Saved')).toBeInTheDocument();
    });

    it('shows the macro split as a share of calories', () => {
        mockPlan();

        render(<Goals />);

        const split = screen.getByRole('img', { name: /Macro split/ });

        expect(split).toHaveAccessibleName(
            'Macro split: 24% protein, 45% carbs, 30% fat',
        );
    });

    it('rejects values outside the database ranges', async () => {
        const user = userEvent.setup();

        mockPlan();
        render(<Goals />);

        const calories = screen.getByLabelText('Calories');

        await user.clear(calories);
        await user.type(calories, '500');

        expect(screen.getByText('Use 800–8000')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save changes' }),
        ).toBeDisabled();
    });

    it('edits meal periods, keeps ids stable and sorts by time', async () => {
        const user = userEvent.setup();
        const plan = mockPlan();

        render(<Goals />);

        // Move dinner to the start of the day, trim snack to make room.
        const dinnerTime = screen.getByLabelText('Period 4 time');

        await user.clear(dinnerTime);
        await user.type(dinnerTime, '06:00');
        await user.click(
            screen.getByRole('button', { name: 'Add meal period' }),
        );

        expect(screen.getByText(/Total 110%/)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save changes' }),
        ).toBeDisabled();

        await user.click(
            screen.getByRole('button', { name: 'Balance to 100%' }),
        );
        expect(screen.getByText('Total 100%')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Save changes' }));

        const { mealSlots } = plan.updateProfile.mock.calls[0][0];

        expect(mealSlots.map((slot: { id: string }) => slot.id)).toEqual([
            'dinner',
            'breakfast',
            'lunch',
            'snack',
            expect.stringMatching(/^meal-5-[a-z0-9]{4}$/),
        ]);
        expect(
            mealSlots.reduce(
                (total: number, slot: { calorieShare: number }) =>
                    total + slot.calorieShare,
                0,
            ),
        ).toBe(100);
    });

    it('keeps at least one meal period', async () => {
        const user = userEvent.setup();

        mockPlan({
            profile: {
                ...DEFAULT_PROFILE,
                mealSlots: [DEFAULT_PROFILE.mealSlots[0]],
            },
        });
        render(<Goals />);

        expect(
            screen.getByRole('button', { name: /^Remove period 1/ }),
        ).toBeDisabled();

        await user.click(
            screen.getByRole('button', { name: 'Add meal period' }),
        );
        await user.click(
            screen.getByRole('button', { name: /^Remove period 2/ }),
        );

        expect(
            screen.queryByLabelText('Period 2 name'),
        ).not.toBeInTheDocument();
    });

    it('offers an upgrade at the free meal period limit', () => {
        mockPlan({ tier: 'free', limits: PLAN_LIMITS.free });

        render(<Goals />);

        // Four default periods is the free cap.
        expect(
            screen.queryByRole('button', { name: 'Add meal period' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('More meal periods')).toBeInTheDocument();
    });

    it('shows an error when saving fails', async () => {
        const user = userEvent.setup();
        const plan = mockPlan();

        plan.updateProfile.mockRejectedValue(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<Goals />);

        const fibre = screen.getByLabelText('Fibre');

        await user.clear(fibre);
        await user.type(fibre, '25');
        await user.click(screen.getByRole('button', { name: 'Save changes' }));

        const alert = await screen.findByRole('alert');

        expect(within(alert).getByText(/Could not save/)).toBeInTheDocument();
    });
});
