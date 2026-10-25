import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Recipe } from '../shared/types/recipe';
import { getRecipeCalories } from './services/mealPlanService';
import './RecipePickerDialog.css';

type RecipePickerDialogProps = {
    title: string;
    recipes: Recipe[];
    onPick: (recipe: Recipe) => void;
    onClose: () => void;
};

// Dialog on desktop, bottom sheet on phones.
export default function RecipePickerDialog({
    title,
    recipes,
    onPick,
    onClose,
}: RecipePickerDialogProps) {
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return createPortal(
        <div className="recipe-picker-backdrop" onClick={onClose}>
            <div
                className="recipe-picker"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="recipe-picker-header">
                    <h2>{title}</h2>
                    <button
                        type="button"
                        className="recipe-picker-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </header>
                <div className="recipe-picker-list">
                    {recipes.map((recipe, index) => (
                        <button
                            type="button"
                            key={recipe.id ?? `${recipe.recipeName}-${index}`}
                            className="recipe-picker-row"
                            onClick={() => onPick(recipe)}
                        >
                            <span className="recipe-picker-name">
                                {recipe.recipeName}
                            </span>
                            <span className="list-row-kcal">
                                {Math.round(getRecipeCalories(recipe))} kcal
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}
