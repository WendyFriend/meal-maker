import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './IngredientNutritionSheet.css';
import type { IngredientNutrition } from '../../../shared/types/types';

type IngredientNutritionSheetProps = {
    ingredient: IngredientNutrition;
    onClose: () => void;
};

function IngredientNutritionSheet({
    ingredient,
    onClose,
}: IngredientNutritionSheetProps) {
    const panelRef = useRef<HTMLDivElement>(null);

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
            </div>
        </>,
        document.body,
    );
}

export default IngredientNutritionSheet;
