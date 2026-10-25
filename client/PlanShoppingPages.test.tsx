import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_LIMITS } from '../shared/plans';
import { DEFAULT_PROFILE, type MealSlotConfig } from '../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../shared/types/recipe';
import type { UserIngredient } from '../shared/types/types';
import ShoppingList from './ShoppingList';
import DayPlanner from './planner/DayPlanner';
import * as planContext from './plan/PlanContext';
import * as recipeService from './services/recipeService';
import * as mealPlanService from './services/mealPlanService';
import * as generateMealService from './services/generateMealService';
import * as shoppingListService from './services/shoppingListService';

vi.mock('./lib/supabase', () => ({ supabase: {} }));
vi.mock('./plan/PlanContext', async (importOriginal) => ({
    ...(await importOriginal<typeof planContext>()),
    usePlan: vi.fn(),
}));
vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn(),
    saveRecipe: vi.fn(),
    countRecipes: vi.fn(),
}));
vi.mock('./services/mealPlanService', async (importOriginal) => ({
    ...(await importOriginal<typeof mealPlanService>()),
    getEntriesForRange: vi.fn(),
    addEntry: vi.fn(),
    removeEntry: vi.fn(),
    updateEntryServings: vi.fn(),
}));
vi.mock('./services/generateMealService', () => ({ requestMeal: vi.fn() }));
vi.mock('./services/shoppingListService', async (importOriginal) => ({
    ...(await importOriginal<typeof shoppingListService>()),
    getItems: vi.fn(),
    addItems: vi.fn(),
    setChecked: vi.fn(),
    removeItem: vi.fn(),
    clearChecked: vi.fn(),
}));

const porridge: Recipe = {
    id: 'r1',
    userId: 'u',
    recipeName: 'Porridge',
    instructions: [],
    servings: 2,
    ingredients: [
        {
            name: 'Oats',
            weight: 50,
            caloriesPer100g: 380,
            proteinPer100g: 13,
            carbohydratePer100g: 60,
            fatPer100g: 7,
        },
    ],
} as Recipe;

const oats: UserIngredient = {
    ingredientId: 'i1',
    name: 'Oats',
    caloriesPer100g: 380,
    proteinPer100g: 13,
    carbohydratePer100g: 60,
    fatPer100g: 7,
    isFavorite: true,
};

const today = mealPlanService.toDateKey(new Date());

function plannedLunch(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
    return {
        id: 'e1',
        planDate: today,
        slot: 'lunch',
        recipeId: 'r1',
        servings: 1,
        ...overrides,
    };
}

function mockPlan(
    overrides: Partial<ReturnType<typeof planContext.usePlan>> = {},
) {
    const value = {
        profile: { ...DEFAULT_PROFILE, plan: 'pro' as const },
        isLoading: false,
        tier: 'pro' as const,
        limits: PLAN_LIMITS.pro,
        generationsToday: 0,
        generationsLeft: PLAN_LIMITS.pro.generationsPerDay,
        canGenerate: true,
        recordGeneration: vi.fn().mockResolvedValue(undefined),
        updateProfile: vi.fn(),
        startTrial: vi.fn(),
        openPlans: vi.fn(),
        ...overrides,
    };

    vi.mocked(planContext.usePlan).mockReturnValue(value);

    return value;
}

beforeEach(() => {
    vi.resetAllMocks();
    mockPlan();
    vi.mocked(recipeService.getRecipes).mockResolvedValue([porridge]);
    vi.mocked(recipeService.countRecipes).mockResolvedValue(0);
    vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([]);
    vi.mocked(shoppingListService.getItems).mockResolvedValue([]);
});

function renderPlanner(props: Partial<Parameters<typeof DayPlanner>[0]> = {}) {
    const handlers = {
        onOpenRecipe: vi.fn(),
        onSavedMealsChanged: vi.fn(),
        onEditGoals: vi.fn(),
    };

    render(<DayPlanner savedIngredients={[oats]} {...handlers} {...props} />);

    return handlers;
}

describe('DayPlanner', () => {
    it('shows the meal periods from the profile, sorted by time', async () => {
        const mealSlots: MealSlotConfig[] = [
            { id: 'supper', label: 'Supper', time: '20:30', calorieShare: 20 },
            { id: 'brunch', label: 'Brunch', time: '10:00', calorieShare: 50 },
            { id: 'tea', label: 'Tea', time: '16:00', calorieShare: 30 },
        ];
        mockPlan({ profile: { ...DEFAULT_PROFILE, mealSlots } });

        renderPlanner();

        expect(
            await screen.findByRole('heading', { name: 'Today' }),
        ).toBeInTheDocument();
        const periods = (await screen.findAllByRole('heading', { level: 3 }))
            .map((heading) => heading.textContent)
            .filter((text) => ['Supper', 'Brunch', 'Tea'].includes(text ?? ''));

        expect(periods).toEqual(['Brunch', 'Tea', 'Supper']);
        // Budgets come from each period's share of the 2,000 kcal target.
        expect(
            screen.getByRole('region', { name: 'Brunch' }),
        ).toHaveTextContent('0 / 1,000 kcal');
    });

    it('groups entries whose period no longer exists under Other', async () => {
        vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([
            plannedLunch({ slot: 'removed-slot' }),
        ]);

        renderPlanner();

        const other = await screen.findByRole('region', { name: 'Other' });

        expect(within(other).getByText('Porridge')).toBeInTheDocument();
    });

    it('adds a saved meal to a period with the period id', async () => {
        const user = userEvent.setup();
        vi.mocked(mealPlanService.addEntry).mockResolvedValue(
            plannedLunch({ id: 'e9' }),
        );

        renderPlanner();

        await user.click(
            await screen.findByRole('button', { name: 'Add meal to Lunch' }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'Add to Lunch',
        });
        await user.click(
            within(dialog).getByRole('tab', { name: 'Saved meals' }),
        );
        // 50 g * 380 kcal / 100 per serving; Lunch is 30% of 2,000 kcal.
        expect(within(dialog).getByText('190 kcal')).toBeInTheDocument();
        expect(within(dialog).getByText('Fits budget')).toBeInTheDocument();
        await user.click(within(dialog).getByText('Porridge'));

        expect(mealPlanService.addEntry).toHaveBeenCalledWith(
            today,
            'lunch',
            'r1',
            1,
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        const lunch = screen.getByRole('region', { name: 'Lunch' });

        expect(within(lunch).getByText('Porridge')).toBeInTheDocument();
        expect(within(lunch).getByText('190 kcal')).toBeInTheDocument();
    });

    it('closes the add sheet with Escape', async () => {
        const user = userEvent.setup();

        renderPlanner();

        await user.click(
            await screen.findByRole('button', { name: 'Add meal to Dinner' }),
        );
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sends the day context and a budgeted calorie target when recommending', async () => {
        const user = userEvent.setup();
        const plan = mockPlan();
        vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([
            plannedLunch(),
        ]);
        vi.mocked(generateMealService.requestMeal).mockResolvedValue({
            ok: true,
            meal: {
                mealName: 'Berry Oat Bowl',
                ingredients: [
                    {
                        name: 'Oats',
                        weight: 80,
                        caloriesPer100g: 380,
                        proteinPer100g: 13,
                        carbohydratePer100g: 60,
                        fatPer100g: 7,
                    },
                ],
                instructions: ['Stir it together.'],
            },
        });
        vi.mocked(recipeService.saveRecipe).mockResolvedValue({
            ...porridge,
            id: 'r2',
            recipeName: 'Berry Oat Bowl',
        });
        vi.mocked(mealPlanService.addEntry).mockResolvedValue(
            plannedLunch({ id: 'e2', slot: 'breakfast', recipeId: 'r2' }),
        );
        const { onSavedMealsChanged } = renderPlanner();

        await user.click(
            await screen.findByRole('button', {
                name: 'Add meal to Breakfast',
            }),
        );
        const dialog = await screen.findByRole('dialog');

        // Lunch holds 190 kcal; 1,810 kcal left split over the empty
        // breakfast, snack and dinner (25 + 10 + 35 shares).
        expect(
            within(dialog).getByLabelText('Period budget'),
        ).toHaveTextContent('≈ 650 kcal');

        await user.click(within(dialog).getByRole('button', { name: 'Oats' }));
        await user.click(
            within(dialog).getByRole('button', { name: 'Recommend a meal' }),
        );

        await waitFor(() =>
            expect(generateMealService.requestMeal).toHaveBeenCalledTimes(1),
        );
        const request = vi.mocked(generateMealService.requestMeal).mock
            .calls[0][0];

        expect(request.ingredients).toEqual([
            expect.objectContaining({ name: 'Oats', caloriesPer100g: 380 }),
        ]);
        expect(request.requirements).toMatchObject({
            calories: 650,
            mealType: 'breakfast',
            servings: 1,
            dayContext: {
                slotLabel: 'Breakfast',
                dailyTargets: DEFAULT_PROFILE.targets,
                plannedSoFar: { calories: 190 },
            },
        });
        expect(request.requirements.dayContext?.focusNutrients).toContain(
            'Fibre',
        );
        expect(plan.recordGeneration).toHaveBeenCalled();

        expect(await within(dialog).findByText('Berry Oat Bowl')).toBeVisible();
        await user.click(
            within(dialog).getByRole('button', { name: 'Add to Breakfast' }),
        );

        await waitFor(() =>
            expect(mealPlanService.addEntry).toHaveBeenCalledWith(
                today,
                'breakfast',
                'r2',
            ),
        );
        expect(recipeService.saveRecipe).toHaveBeenCalledWith(
            expect.objectContaining({
                recipeName: 'Berry Oat Bowl',
                source: 'generated',
                mealType: 'breakfast',
            }),
        );
        expect(onSavedMealsChanged).toHaveBeenCalled();
    });

    it('shows why a recommendation failed', async () => {
        const user = userEvent.setup();
        vi.mocked(generateMealService.requestMeal).mockResolvedValue({
            ok: false,
            error: {
                code: 'REQUIREMENT_NOT_MET',
                message: 'That much protein is not possible.',
                proteinGoal: 90,
                maximumProteinPercentage: 40,
            },
        });

        renderPlanner();

        await user.click(
            await screen.findByRole('button', { name: 'Add meal to Dinner' }),
        );
        await user.click(await screen.findByRole('button', { name: 'Oats' }));
        await user.click(
            screen.getByRole('button', { name: 'Recommend a meal' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'That much protein is not possible.',
        );
    });

    it('shows the remaining AI meals and blocks recommending at the limit', async () => {
        const user = userEvent.setup();
        mockPlan({
            tier: 'free',
            limits: PLAN_LIMITS.free,
            generationsLeft: 0,
            canGenerate: false,
        });

        renderPlanner();

        await user.click(
            await screen.findByRole('button', { name: 'Add meal to Dinner' }),
        );

        expect(await screen.findByText('Daily AI limit reached')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Oats' }));
        expect(
            screen.getByRole('button', { name: 'Recommend a meal' }),
        ).toBeDisabled();
    });

    it('counts down the free AI allowance', async () => {
        const user = userEvent.setup();
        mockPlan({
            tier: 'free',
            limits: PLAN_LIMITS.free,
            generationsLeft: 3,
        });

        renderPlanner();

        await user.click(
            await screen.findByRole('button', { name: 'Add meal to Dinner' }),
        );

        expect(await screen.findByText(/3 left today/)).toBeInTheDocument();
    });

    it('locks days beyond the free planning window', async () => {
        const user = userEvent.setup();
        mockPlan({ tier: 'free', limits: PLAN_LIMITS.free });

        renderPlanner();

        await screen.findByRole('button', { name: 'Add meal to Lunch' });
        const next = screen.getByRole('button', { name: 'Next day' });

        // Free plans cover today plus two days ahead.
        await user.click(next);
        await user.click(next);
        expect(
            await screen.findByRole('button', { name: 'Add meal to Lunch' }),
        ).toBeInTheDocument();

        await user.click(next);

        expect(await screen.findByText('Plan further ahead')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Add meal to Lunch' }),
        ).not.toBeInTheDocument();
    });

    it('locks the reuse tools on the free plan', async () => {
        const user = userEvent.setup();
        const plan = mockPlan({ tier: 'free', limits: PLAN_LIMITS.free });
        vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([
            plannedLunch(),
        ]);

        renderPlanner();

        await user.click(
            await screen.findByRole('button', {
                name: 'Repeat Porridge tomorrow (Pro)',
            }),
        );

        expect(plan.openPlans).toHaveBeenCalledWith('Plan reuse tools');
        expect(mealPlanService.addEntry).not.toHaveBeenCalled();
    });

    it('repeats a meal tomorrow and adds the day to the shopping list', async () => {
        const user = userEvent.setup();
        vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([
            plannedLunch({ servings: 1.5 }),
        ]);
        const tomorrow = mealPlanService.toDateKey(
            mealPlanService.addDays(new Date(), 1),
        );
        vi.mocked(mealPlanService.addEntry).mockResolvedValue(
            plannedLunch({ id: 'e3', planDate: tomorrow }),
        );
        vi.mocked(shoppingListService.addItems).mockResolvedValue(1);

        renderPlanner();

        await user.click(
            await screen.findByRole('button', {
                name: 'Repeat Porridge tomorrow',
            }),
        );
        expect(mealPlanService.addEntry).toHaveBeenCalledWith(
            tomorrow,
            'lunch',
            'r1',
            1.5,
        );

        await user.click(
            screen.getByRole('button', {
                name: 'Add this day to shopping list',
            }),
        );
        // 50 g per serving x recipe servings 2 x 1.5 portions
        expect(shoppingListService.addItems).toHaveBeenCalledWith([
            { name: 'Oats', quantity: '150 g' },
        ]);
        expect(await screen.findByText('Added 1 item')).toBeInTheDocument();
    });

    it('changes servings and removes entries', async () => {
        const user = userEvent.setup();
        vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([
            plannedLunch(),
        ]);
        vi.mocked(mealPlanService.updateEntryServings).mockResolvedValue(
            plannedLunch({ servings: 1.5 }),
        );

        renderPlanner();

        await user.click(
            await screen.findByRole('button', {
                name: 'More servings of Porridge',
            }),
        );

        expect(mealPlanService.updateEntryServings).toHaveBeenCalledWith(
            'e1',
            1.5,
        );
        // 190 kcal x 1.5
        expect(await screen.findByText('285 kcal × 1.5')).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Remove Porridge' }),
        );

        expect(mealPlanService.removeEntry).toHaveBeenCalledWith('e1');
        await waitFor(() =>
            expect(screen.queryByText('Porridge')).not.toBeInTheDocument(),
        );
    });

    it('sends you to the goals page from the summary', async () => {
        const user = userEvent.setup();
        const { onEditGoals } = renderPlanner();

        await user.click(
            await screen.findByRole('button', { name: 'Edit goals' }),
        );

        expect(onEditGoals).toHaveBeenCalled();
    });
});

describe('ShoppingList', () => {
    it('shows counts with unchecked items first', async () => {
        vi.mocked(shoppingListService.getItems).mockResolvedValue([
            { id: '1', name: 'Eggs', checked: true },
            { id: '2', name: 'Rice', quantity: '200 g', checked: false },
        ]);

        render(<ShoppingList />);

        expect(
            await screen.findByText('1 to buy · 1 checked'),
        ).toBeInTheDocument();
        const names = screen
            .getAllByRole('checkbox')
            .map((box) => box.closest('li')?.textContent);
        expect(names[0]).toContain('Rice');
        expect(names[1]).toContain('Eggs');
    });

    it('adds a custom item', async () => {
        const user = userEvent.setup();
        vi.mocked(shoppingListService.addItems).mockResolvedValue(1);

        render(<ShoppingList />);

        await screen.findByText('Your list is empty');
        await user.type(screen.getByLabelText('Item name'), 'Milk');
        await user.type(screen.getByLabelText('Quantity'), '2 L');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(shoppingListService.addItems).toHaveBeenCalledWith([
                { name: 'Milk', quantity: '2 L' },
            ]),
        );
    });
});
