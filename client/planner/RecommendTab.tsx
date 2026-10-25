import { useState } from 'react';
import type { DailyTargets, MealSlotConfig } from '../../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import type {
    GenerateMealResponse,
    MealRequirements,
    MealVariation,
    UserIngredient,
} from '../../shared/types/types';
import UpgradeNotice from '../plan/UpgradeNotice';
import { usePlan } from '../plan/PlanContext';
import { requestMeal } from '../services/generateMealService';
import { addEntry } from '../services/mealPlanService';
import { countRecipes, saveRecipe } from '../services/recipeService';
import { loadDietPreference } from '../utils/diet';
import { normalizeIngredientName } from '../utils/Ingredient';
import type { NutritionTotals, SlotBudget } from './budget';
import GeneratedMealPreview from './GeneratedMealPreview';
import IngredientPicker from './IngredientPicker';
import { toIngredientInfo } from './ingredientInfo';

type RecommendTabProps = {
    date: string;
    slot: MealSlotConfig;
    budget: SlotBudget;
    targets: DailyTargets;
    // Everything planned that day so far.
    plannedSoFar: NutritionTotals;
    focusNutrients: string[];
    savedIngredients: UserIngredient[];
    onAdded: (entry: MealPlanEntry, recipe: Recipe) => void;
};

const GENERIC_ERROR = 'Something went wrong. Please try again.';

export default function RecommendTab({
    date,
    slot,
    budget,
    targets,
    plannedSoFar,
    focusNutrients,
    savedIngredients,
    onAdded,
}: RecommendTabProps) {
    const { tier, limits, generationsLeft, canGenerate, recordGeneration } =
        usePlan();
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [meal, setMeal] = useState<GenerateMealResponse | null>(null);
    const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMealsFull, setSavedMealsFull] = useState(false);

    const favorites = savedIngredients.filter(
        (ingredient) => ingredient.isFavorite,
    );
    const favoriteNames = new Set(
        favorites.map((ingredient) => normalizeIngredientName(ingredient.name)),
    );
    const extraIngredients = ingredients.filter(
        (name) => !favoriteNames.has(normalizeIngredientName(name)),
    );

    function isSelected(name: string) {
        const normalized = normalizeIngredientName(name);

        return ingredients.some(
            (selected) => normalizeIngredientName(selected) === normalized,
        );
    }

    function toggle(name: string) {
        const normalized = normalizeIngredientName(name);

        setIngredients((current) =>
            isSelected(name)
                ? current.filter(
                      (selected) =>
                          normalizeIngredientName(selected) !== normalized,
                  )
                : [...current, name],
        );
    }

    async function generate(variation?: MealVariation) {
        setIsGenerating(true);
        setError(null);
        setSavedMealsFull(false);

        const diet = loadDietPreference();
        const requirements: MealRequirements = {
            calories: budget.calories,
            proteinPercentage: budget.proteinPercentage,
            servings: 1,
            mealType: budget.mealType,
            dayContext: {
                slotLabel: slot.label,
                dailyTargets: targets,
                plannedSoFar,
                focusNutrients,
            },
        };

        if (diet.length > 0) requirements.dietary = diet;
        if (variation && meal) {
            requirements.variation = variation;
            requirements.previousMealName = meal.mealName;
        }

        const result = await requestMeal({
            ingredients: ingredients.map((name) =>
                toIngredientInfo(name, savedIngredients),
            ),
            requirements,
        });

        setIsGenerating(false);

        if (!result.ok) {
            setError(result.error.message || GENERIC_ERROR);
            return;
        }

        await recordGeneration();
        setMeal(result.meal);
        setSavedRecipe(null);
    }

    async function handleAdd() {
        if (!meal) return;

        setIsAdding(true);
        setError(null);

        try {
            let recipe = savedRecipe;

            if (!recipe) {
                const cap = limits.savedMeals;

                if (cap !== null && (await countRecipes()) >= cap) {
                    setSavedMealsFull(true);
                    return;
                }

                recipe = await saveRecipe({
                    recipeName: meal.mealName,
                    ingredients: meal.ingredients,
                    instructions: meal.instructions,
                    servings: meal.servings ?? 1,
                    source: 'generated',
                    mealType: budget.mealType,
                });
                // Kept so a failed addEntry retry doesn't save it twice.
                setSavedRecipe(recipe);
            }

            const entry = await addEntry(date, slot.id, recipe.id as string);

            onAdded(entry, recipe);
        } catch (error) {
            console.error(error);
            setError('Could not add that meal. Please try again.');
        } finally {
            setIsAdding(false);
        }
    }

    const budgetLine = `≈ ${budget.calories} kcal · ${budget.proteinG} g protein left for ${slot.label.toLowerCase()}`;

    const allowance = [
        ingredients.length === 0 && 'Pick at least one ingredient',
        tier !== 'pro' && canGenerate && `${generationsLeft} left today`,
    ]
        .filter(Boolean)
        .join(' · ');

    if (meal) {
        return (
            <div className="add-sheet-panel">
                <div className="add-sheet-scroll">
                    <p className="add-sheet-budget" aria-label="Period budget">
                        {budgetLine}
                    </p>
                    <GeneratedMealPreview meal={meal} budget={budget} />
                    {savedMealsFull && (
                        <UpgradeNotice
                            feature="Saved meal limit reached"
                            description={`Free keeps up to ${limits.savedMeals} saved meals. Remove one or upgrade for unlimited.`}
                        />
                    )}
                    {!canGenerate && (
                        <UpgradeNotice
                            feature="Daily AI limit reached"
                            description="Upgrade for more AI meals each day."
                            compact
                        />
                    )}
                    {error && (
                        <p className="add-sheet-error" role="alert">
                            {error}
                        </p>
                    )}
                </div>
                <div className="add-sheet-actions">
                    <button
                        type="button"
                        className="add-sheet-primary"
                        onClick={handleAdd}
                        disabled={isAdding || isGenerating}
                    >
                        {isAdding ? 'Adding...' : `Add to ${slot.label}`}
                    </button>
                    <button
                        type="button"
                        className="add-sheet-secondary"
                        onClick={() => generate('different')}
                        disabled={isAdding || isGenerating || !canGenerate}
                    >
                        {isGenerating ? 'Thinking...' : 'Try another'}
                    </button>
                    <button
                        type="button"
                        className="add-sheet-text-button"
                        onClick={() => {
                            setMeal(null);
                            setError(null);
                            setSavedMealsFull(false);
                        }}
                        disabled={isAdding || isGenerating}
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="add-sheet-panel">
            <div className="add-sheet-scroll">
                <div className="add-sheet-budget-card">
                    <p className="add-sheet-budget" aria-label="Period budget">
                        {budgetLine}
                    </p>
                    {focusNutrients.length > 0 && (
                        <p className="add-sheet-focus">
                            Leaning towards {focusNutrients.join(', ')}
                        </p>
                    )}
                </div>

                <section className="add-sheet-section">
                    <h3>Your favourites</h3>
                    {favorites.length > 0 ? (
                        <div className="add-sheet-chips">
                            {favorites.map((ingredient) => (
                                <button
                                    key={ingredient.ingredientId}
                                    type="button"
                                    className="add-sheet-chip"
                                    aria-pressed={isSelected(ingredient.name)}
                                    onClick={() => toggle(ingredient.name)}
                                >
                                    {ingredient.name}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="add-sheet-hint">
                            Star ingredients on the Ingredients page and
                            they&apos;ll show up here for one-tap picking.
                        </p>
                    )}
                </section>

                <section className="add-sheet-section">
                    <h3>Other ingredients</h3>
                    <IngredientPicker
                        selected={ingredients}
                        savedIngredients={savedIngredients}
                        onAdd={(name) => {
                            if (!isSelected(name)) toggle(name);
                        }}
                    />
                    {extraIngredients.length > 0 && (
                        <div className="add-sheet-chips">
                            {extraIngredients.map((name) => (
                                <span
                                    key={name}
                                    className="add-sheet-chip add-sheet-chip-selected"
                                >
                                    {name}
                                    <button
                                        type="button"
                                        onClick={() => toggle(name)}
                                        aria-label={`Remove ${name}`}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
                                            <path d="M6 6l12 12M18 6L6 18" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </section>

                {!canGenerate && (
                    <UpgradeNotice
                        feature="Daily AI limit reached"
                        description="You've used today's AI meals. Upgrade for more, or add one of your saved meals."
                    />
                )}
                {error && (
                    <p className="add-sheet-error" role="alert">
                        {error}
                    </p>
                )}
            </div>
            <div className="add-sheet-actions">
                <button
                    type="button"
                    className="add-sheet-primary"
                    onClick={() => generate()}
                    disabled={
                        isGenerating || !canGenerate || ingredients.length === 0
                    }
                    aria-busy={isGenerating}
                >
                    {isGenerating ? 'Thinking...' : 'Recommend a meal'}
                </button>
                <span className="add-sheet-allowance">{allowance}</span>
            </div>
        </div>
    );
}
