import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { getUserIngredients } from './services/ingredientService';
import { countRecipes, saveRecipe } from './services/recipeService';
import { addEntry } from './services/mealPlanService';
import { clearMatchCache } from './services/matchService';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import { PLAN_LIMITS, type PlanTier } from '../shared/plans';
import { DEFAULT_PROFILE } from '../shared/types/profile';
import type { NutritionSearchResult } from '../shared/types/types';

// The plan is whatever the test sets; PlanProvider just renders its children.
const plan = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('./plan/PlanContext', () => ({
    PlanProvider: ({ children }: { children: React.ReactNode }) => children,
    usePlan: () => plan.value,
}));
vi.mock('./auth/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'user' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('./services/ingredientService', () => ({
    getUserIngredients: vi.fn(),
    saveUserIngredient: vi.fn(),
    updateUserIngredient: vi.fn(),
    deleteUserIngredient: vi.fn(),
}));
vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn().mockResolvedValue([]),
    saveRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    countRecipes: vi.fn(),
}));
vi.mock('./services/mealPlanService', () => ({
    addEntry: vi.fn(),
    toDateKey: (date: Date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    addDays: (date: Date, days: number) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
}));

function makePlan(tier: PlanTier, overrides: Record<string, unknown> = {}) {
    const limits = PLAN_LIMITS[tier];

    return {
        profile: { ...DEFAULT_PROFILE, plan: tier },
        isLoading: false,
        tier,
        limits,
        generationsToday: 0,
        generationsLeft: limits.generationsPerDay,
        canGenerate: true,
        recordGeneration: vi.fn().mockResolvedValue(undefined),
        updateProfile: vi.fn(),
        startTrial: vi.fn(),
        openPlans: vi.fn(),
        ...overrides,
    };
}

function usdaFood(
    fdcId: number,
    description: string,
    caloriesPer100g: number,
    micronutrientsPer100g = { vitaminK: 19, sodium: 24 },
): NutritionSearchResult {
    return {
        name: 'Kidney beans',
        description,
        source: 'usda',
        caloriesPer100g,
        proteinPer100g: 8,
        carbohydratePer100g: 20,
        fatPer100g: 1,
        micronutrientsPer100g,
        usda: { fdcId, description },
    };
}

const rawBeans = usdaFood(
    1,
    'Beans, kidney, all types, mature seeds, raw',
    333,
);
const cannedBeans = usdaFood(
    2,
    'Beans, kidney, red, mature seeds, canned, drained',
    94,
);

const beanMeal = {
    mealName: 'Bean bowl',
    instructions: ['Boil the beans hard, then serve.'],
    servings: 1,
    ingredients: [
        {
            ...rawBeans,
            name: 'Kidney beans',
            weight: 100,
            nutritionSource: 'usda',
        },
    ],
};

function mockFetch(confidence: 'high' | 'low' = 'high') {
    const fetch = vi.fn<
        (url: string, init: { body: string }) => Promise<unknown>
    >(async (url) => ({
        status: 200,
        ok: true,
        json: async () =>
            url === '/api/match-ingredients'
                ? {
                      matches: [
                          {
                              query: 'Kidney beans',
                              match: rawBeans,
                              alternatives: [cannedBeans],
                              confidence,
                          },
                      ],
                  }
                : beanMeal,
    }));
    vi.stubGlobal('fetch', fetch);

    return Object.assign(fetch, {
        generateRequests: () =>
            fetch.mock.calls
                .filter(([url]) => url === '/api/generate-meal')
                .map(([, init]) =>
                    JSON.parse((init as unknown as { body: string }).body),
                ),
    });
}

async function addBeans(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByRole('combobox'), 'Kidney beans{Enter}');
}

beforeEach(() => {
    localStorage.clear();
    clearMatchCache();
    mockPickerEnvironment();
    plan.value = makePlan('pro');
    vi.mocked(getUserIngredients).mockResolvedValue([]);
    vi.mocked(countRecipes).mockResolvedValue(0);
    vi.mocked(saveRecipe).mockResolvedValue({
        id: 'r1',
        userId: 'user',
        recipeName: 'Bean bowl',
        ingredients: [],
        instructions: [],
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

it('shows the USDA match and sends the one the user switches to', async () => {
    const fetch = mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);

    const list = await screen.findByRole('region', { name: 'Nutrition data' });
    expect(
        await within(list).findByText(
            'Beans, kidney, all types, mature seeds, raw',
        ),
    ).toBeInTheDocument();
    expect(within(list).getByText('333 kcal/100 g')).toBeInTheDocument();

    await user.click(
        screen.getByRole('button', {
            name: 'Change nutrition source for Kidney beans',
        }),
    );
    await user.click(screen.getByRole('radio', { name: /canned, drained/ }));
    expect(within(list).getByText('94 kcal/100 g')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    await waitFor(() => expect(fetch.generateRequests()).toHaveLength(1));

    const [sent] = fetch.generateRequests()[0].ingredients;
    expect(sent).toMatchObject({
        name: 'Kidney beans',
        caloriesPer100g: 94,
        usda: { fdcId: 2 },
        micronutrientsPer100g: { vitaminK: 19 },
    });
});

it('can leave an ingredient to the AI instead of the USDA match', async () => {
    const fetch = mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);
    await screen.findByText('Beans, kidney, all types, mature seeds, raw');
    await user.click(
        screen.getByRole('button', {
            name: 'Change nutrition source for Kidney beans',
        }),
    );
    await user.click(screen.getByRole('radio', { name: 'Let AI estimate' }));
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(fetch.generateRequests()).toHaveLength(1));
    expect(fetch.generateRequests()[0].ingredients).toEqual([
        { name: 'Kidney beans' },
    ]);
});

it('sends the best match, waiting for it if the lookup is still running', async () => {
    const fetch = mockFetch('low');
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);
    // Straight away, before the debounced lookup has started.
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(fetch.generateRequests()).toHaveLength(1));
    expect(fetch.generateRequests()[0].ingredients[0]).toMatchObject({
        usda: { fdcId: 1 },
    });
    expect(await screen.findByText(/Loose match/)).toBeInTheDocument();
});

it('shows preparation notes for kidney beans in the form and the result', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    expect(
        screen.queryByRole('region', { name: 'Preparation notes' }),
    ).not.toBeInTheDocument();

    await addBeans(user);
    const notes = screen.getByRole('region', { name: 'Preparation notes' });
    expect(
        within(notes).getByText('Kidney beans must be boiled hard'),
    ).toBeInTheDocument();
    expect(within(notes).getByText('Must')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    const result = await screen.findByRole('region', {
        name: 'Preparation & safety',
    });
    expect(
        within(result).getByText('Kidney beans must be boiled hard'),
    ).toBeInTheDocument();
});

it('shows vitamins on Pro, per serving with % Daily Value', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    expect(await screen.findByText('Vitamin K')).toBeInTheDocument();
    expect(screen.getByText('19 µg')).toBeInTheDocument();
    expect(screen.getByText('16% DV')).toBeInTheDocument();
});

it('limits the free plan to basic nutrients and locks variations', async () => {
    plan.value = makePlan('free', { generationsLeft: 3 });
    const fetch = mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);
    expect(screen.getByText(/of 5 AI meals left today/)).toHaveTextContent(
        '3 of 5 AI meals left today',
    );
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    // Sodium is a basic nutrient; vitamins are not.
    expect(await screen.findByText('Sodium')).toBeInTheDocument();
    expect(screen.queryByText('Vitamin K')).not.toBeInTheDocument();
    expect(screen.getByText('Vitamins & minerals')).toBeInTheDocument();
    expect(
        (plan.value as ReturnType<typeof makePlan>).recordGeneration,
    ).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Higher protein/ }));
    expect(
        (plan.value as ReturnType<typeof makePlan>).openPlans,
    ).toHaveBeenCalledWith('Meal variations');
    expect(fetch.generateRequests()).toHaveLength(1);

    // "Try another" is not gated.
    await user.click(screen.getByRole('button', { name: 'Try another' }));
    await waitFor(() => expect(fetch.generateRequests()).toHaveLength(2));
});

it('replaces the Create button with an upgrade notice once the daily limit is used', async () => {
    plan.value = makePlan('free', { generationsLeft: 0, canGenerate: false });
    mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    expect(screen.getByText('Daily AI meal limit reached')).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Create my meal' }),
    ).not.toBeInTheDocument();

    // The rest of the form still works.
    await addBeans(user);
    expect(
        screen.getByRole('button', {
            name: 'Edit nutrition for Kidney beans',
        }),
    ).toBeInTheDocument();
});

it('saves a generated meal and adds it to the chosen day and meal period', async () => {
    mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);
    await user.click(screen.getByRole('button', { name: /More options/ }));
    await user.click(screen.getByRole('button', { name: 'Dinner' }));
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    await user.click(
        await screen.findByRole('button', { name: 'Add to plan' }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Add to plan' });
    // The meal type picks the meal period.
    expect(
        within(dialog).getByRole('button', { name: 'Dinner' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Lunch' }));
    await user.click(within(dialog).getByRole('button', { name: 'Tomorrow' }));
    await user.click(
        within(dialog).getByRole('button', { name: 'Add to plan' }),
    );

    expect(await screen.findByText('Added to your plan')).toBeInTheDocument();
    expect(saveRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
            recipeName: 'Bean bowl',
            source: 'generated',
            mealType: 'dinner',
        }),
    );
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(addEntry).toHaveBeenCalledWith(
        `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`,
        'lunch',
        'r1',
        1,
    );
});

it("does not save past the free plan's saved meal limit", async () => {
    plan.value = makePlan('free');
    vi.mocked(countRecipes).mockResolvedValue(20);
    mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await addBeans(user);
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    await user.click(
        await screen.findByRole('button', { name: 'Save this meal' }),
    );

    expect(
        await screen.findByText('Saved meal limit reached'),
    ).toBeInTheDocument();
    expect(saveRecipe).not.toHaveBeenCalled();
});
