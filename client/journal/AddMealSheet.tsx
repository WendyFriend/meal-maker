import { useEffect, useState } from 'react';
import type { Recipe } from '../../shared/types/recipe';
import SlidingSheet from '../components/SlidingSheet';
import {
    ActionSheetHeading,
    ActionSheetOptions,
} from '../components/ActionSheet';
import LoadingSpinner from '../components/LoadingSpinner';
import { getRecipes } from '../services/recipeService';
import { totalNutrition } from '../utils/nutrition';
import defaultMealPhoto from '../assets/default-meal-photo.jpg';
import './AddMealSheet.css';

type Choice = 'recipes' | 'manual';

const choices: {
    id: Choice;
    label: string;
    symbol: 'recipe' | 'edit';
}[] = [
    { id: 'recipes', label: 'Add from My Recipes', symbol: 'recipe' },
    { id: 'manual', label: 'Create a new one', symbol: 'edit' },
];

/**
 * Bottom sheet behind My Diary's "Add meal": pick a saved recipe (its
 * ingredients are copied into the plan) or enter a meal by hand.
 */
export default function AddMealSheet({
    onClose,
    onAddRecipe,
    onManual,
}: {
    onClose: () => void;
    /** Adds a copy of the recipe to the plan; reject to keep the sheet open. */
    onAddRecipe: (recipe: Recipe) => Promise<void>;
    onManual: () => void;
}) {
    const [view, setView] = useState<'choices' | 'recipes'>('choices');

    return (
        <SlidingSheet
            className={`action-sheet add-meal-sheet${view === 'recipes' ? ' add-meal-sheet-recipes' : ''}`}
            labelledBy="add-meal-sheet-title"
            onClose={onClose}
            header={
                <ActionSheetHeading
                    id="add-meal-sheet-title"
                    title={view === 'recipes' ? 'My Recipes' : 'Add Meal'}
                    closeLabel={
                        view === 'recipes'
                            ? 'Close My Recipes'
                            : 'Close add meal'
                    }
                    onClose={onClose}
                />
            }
        >
            {view === 'choices' ? (
                <ActionSheetOptions
                    options={choices}
                    onChoose={(choice) => {
                        if (choice === 'recipes') setView('recipes');
                        else onManual();
                    }}
                />
            ) : (
                <RecipePicker onAddRecipe={onAddRecipe} />
            )}
        </SlidingSheet>
    );
}

function RecipePicker({
    onAddRecipe,
}: {
    onAddRecipe: (recipe: Recipe) => Promise<void>;
}) {
    const [recipes, setRecipes] = useState<Recipe[]>();
    const [loadError, setLoadError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [addingId, setAddingId] = useState<string>();
    const [addError, setAddError] = useState('');

    useEffect(() => {
        let active = true;
        getRecipes()
            .then((saved) => {
                if (!active) return;
                setRecipes(saved);
                setLoadError('');
            })
            .catch(() => {
                if (active) setLoadError('Could not load your recipes.');
            });
        return () => {
            active = false;
        };
    }, [attempt]);

    async function add(recipe: Recipe) {
        if (addingId) return;
        setAddingId(recipe.id ?? recipe.recipeName);
        setAddError('');
        try {
            await onAddRecipe(recipe);
        } catch {
            setAddError(`Could not add ${recipe.recipeName}. Try again.`);
            setAddingId(undefined);
        }
    }

    if (loadError)
        return (
            <div className="add-meal-recipes-message" role="alert">
                <p>{loadError}</p>
                <button
                    type="button"
                    onClick={() => {
                        setLoadError('');
                        setAttempt((value) => value + 1);
                    }}
                >
                    Try again
                </button>
            </div>
        );
    if (!recipes)
        return (
            <div className="add-meal-recipes-message" role="status">
                <LoadingSpinner size="small" />
                <span>Loading recipes</span>
            </div>
        );
    if (!recipes.length)
        return (
            <p className="add-meal-recipes-message">
                No saved recipes yet. Save one from Meal Maker or My Recipes.
            </p>
        );
    return (
        <>
            {addError && (
                <p className="add-meal-recipes-error" role="alert">
                    {addError}
                </p>
            )}
            <ul className="add-meal-recipes" aria-label="Saved recipes">
                {recipes.map((recipe) => {
                    const key = recipe.id ?? recipe.recipeName;
                    const calories = Math.round(
                        totalNutrition(recipe.ingredients).calories,
                    );
                    const adding = addingId === key;
                    return (
                        <li key={key}>
                            <button
                                type="button"
                                aria-label={`Add ${recipe.recipeName}`}
                                aria-busy={adding || undefined}
                                disabled={Boolean(addingId)}
                                onClick={() => void add(recipe)}
                            >
                                <img
                                    src={defaultMealPhoto}
                                    alt=""
                                    width="36"
                                    height="36"
                                    loading="lazy"
                                    decoding="async"
                                />
                                <span className="add-meal-recipe-info">
                                    <strong>{recipe.recipeName}</strong>
                                    <small>
                                        {recipe.ingredients.length}{' '}
                                        {recipe.ingredients.length === 1
                                            ? 'ingredient'
                                            : 'ingredients'}
                                        {Number.isFinite(calories) &&
                                            ` · ${calories} kcal`}
                                    </small>
                                </span>
                                {adding ? (
                                    <LoadingSpinner
                                        size="small"
                                        tone="inherit"
                                    />
                                ) : (
                                    <span
                                        className="add-meal-recipe-plus"
                                        aria-hidden="true"
                                    >
                                        +
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
