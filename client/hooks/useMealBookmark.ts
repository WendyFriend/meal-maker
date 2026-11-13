import { useCallback, useState } from 'react';
import type { GenerateMealResponse } from '../../shared/types/types';
import { deleteRecipe, saveRecipe } from '../services/recipeService';

export default function useMealBookmark(
    meal: GenerateMealResponse,
    onSavedRecipesChange?: () => void,
    onAuthRequired?: () => boolean | undefined,
) {
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
    const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(
        null,
    );
    const [isSavingMeal, setIsSavingMeal] = useState(false);
    const [bookmarkError, setBookmarkError] = useState<string | null>(null);
    const [bookmarkFeedback, setBookmarkFeedback] = useState(false);
    const closeBookmarkFeedback = useCallback(
        () => setBookmarkFeedback(false),
        [],
    );
    const isBookmarked = optimisticSaved ?? savedRecipeId !== null;

    async function toggleBookmark() {
        if (isSavingMeal) return;
        if (onAuthRequired?.()) return;

        setBookmarkError(null);
        setBookmarkFeedback(false);
        setIsSavingMeal(true);
        setOptimisticSaved(savedRecipeId === null);

        try {
            if (savedRecipeId) {
                await deleteRecipe(savedRecipeId);
                setSavedRecipeId(null);
            } else {
                const savedRecipe = await saveRecipe({
                    recipeName: meal.mealName,
                    ingredients: meal.ingredients,
                    instructions: meal.instructions,
                });

                if (!savedRecipe.id) {
                    throw new Error('saveRecipe did not return a recipe id');
                }

                setSavedRecipeId(savedRecipe.id);
            }
            onSavedRecipesChange?.();
            if (!savedRecipeId) setBookmarkFeedback(true);
        } catch (error) {
            console.error('Failed to toggle saved meal:', error);
            setBookmarkError(
                savedRecipeId
                    ? 'Could not remove this meal. Please try again.'
                    : 'Could not save this meal. Please try again.',
            );
        } finally {
            setOptimisticSaved(null);
            setIsSavingMeal(false);
        }
    }

    return {
        isBookmarked,
        isSavingMeal,
        bookmarkError,
        bookmarkFeedback,
        closeBookmarkFeedback,
        toggleBookmark,
    };
}
