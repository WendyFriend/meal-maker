import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './IngredientNutritionSheet.css';
import type { IngredientNutrition } from '../../../shared/types/types';
import { sumMicronutrients } from '../../../shared/nutrition/nutrients';
import NutrientList from './NutrientList';
import { getIngredientMicronutrients } from './nutrientRows';

type IngredientNutritionSheetProps = {
    // With a weight, vitamins and minerals are shown for that amount.
    ingredient: IngredientNutrition & { weight?: number };
    onClose: () => void;
};

function describeSource({ nutritionSource, usda }: IngredientNutrition) {
    if (usda) return `USDA: ${usda.description}`;
    if (nutritionSource === 'user') return 'Your saved nutrition';
    if (nutritionSource === 'estimated') return 'Estimated by AI';

    return undefined;
}

function IngredientNutritionSheet({
    ingredient,
    onClose,
}: IngredientNutritionSheetProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const source = describeSource(ingredient);
    const weight = ingredient.weight ?? 100;
    const amounts = sumMicronutrients([
        {
            weight,
            micronutrientsPer100g: getIngredientMicronutrients(ingredient),
        },
    ]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        panelRef.current?.focus();

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return createPortal(
        <>
            <div
                className="ingredient-nutrition-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${ingredient.name} nutrition facts`}
                tabIndex={-1}
                className="ingredient-nutrition-sheet"
            >
                <h4 className="ingredient-nutrition-name">{ingredient.name}</h4>

                {source && (
                    <p className="ingredient-nutrition-source">{source}</p>
                )}

                <p className="ingredient-nutrition-caption">
                    Nutrition per 100g
                </p>

                <div className="ingredient-nutrition-rows">
                    <div className="ingredient-nutrition-row">
                        <span>Energy</span>
                        <strong>
                            {Math.round(ingredient.caloriesPer100g)} kcal
                        </strong>
                    </div>

                    <div className="ingredient-nutrition-row">
                        <span>Protein</span>
                        <strong>
                            {ingredient.proteinPer100g.toFixed(1)} g
                        </strong>
                    </div>

                    <div className="ingredient-nutrition-row">
                        <span>Carbs</span>
                        <strong>
                            {ingredient.carbohydratePer100g.toFixed(1)} g
                        </strong>
                    </div>

                    <div className="ingredient-nutrition-row">
                        <span>Fat</span>
                        <strong>{ingredient.fatPer100g.toFixed(1)} g</strong>
                    </div>
                </div>

                <h5 className="ingredient-nutrition-subtitle">
                    {ingredient.weight === undefined
                        ? 'Fats, minerals and vitamins per 100 g'
                        : `In your ${Math.round(weight)} g`}
                </h5>

                <NutrientList amounts={amounts} />
            </div>
        </>,
        document.body,
    );
}

export default IngredientNutritionSheet;
