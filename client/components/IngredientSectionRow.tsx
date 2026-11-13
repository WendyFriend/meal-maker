import { useState } from 'react';
import type { IngredientInfo, MealIngredient } from '../../shared/types/types';
import IngredientCalorieContribution from '../meal-generator/components/IngredientCalorieContribution';
import IngredientNutritionSheet from '../meal-generator/components/IngredientNutritionSheet';
import NutritionInfo from '../meal-generator/components/NutritionInfo';
import IngredientThumbnail from '../meal-generator/components/IngredientThumbnail';
import { IngredientWeightInput } from '../meal-generator/components/IngredientWeightInput';
import './IngredientSectionRow.css';

type WeightControls = {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onDecrease: () => void;
    onIncrease: () => void;
};

/** Shared ingredient row used by recipe details and planned meals. */
export default function IngredientSectionRow({
    ingredient,
    calorieScale,
    weightControls,
    showNutritionSheet = true,
    showChevron = false,
    nutritionLookingUp = false,
    onNutritionResolved,
    className = '',
}: {
    ingredient: MealIngredient;
    calorieScale: number;
    weightControls?: WeightControls;
    showNutritionSheet?: boolean;
    showChevron?: boolean;
    nutritionLookingUp?: boolean;
    onNutritionResolved?: (ingredient: IngredientInfo) => void;
    className?: string;
}) {
    const [nutritionOpen, setNutritionOpen] = useState(false);
    const displayName = ingredient.name;
    const calories = ingredient.nutritionUnavailable
        ? undefined
        : (ingredient.caloriesPer100g * ingredient.weight) / 100;

    return (
        <>
            <div
                className={`meal-ingredient ingredient-section-row${weightControls ? '' : ' ingredient-section-row--readonly'} ${className}`.trim()}
            >
                <IngredientThumbnail
                    name={ingredient.name}
                    fdcId={ingredient.nutritionSource?.fdcId}
                    source={ingredient.thumbnailSource}
                />
                <div className="ingredient-info">
                    <div className="ingredient-info-heading">
                        {showNutritionSheet ? (
                            <button
                                type="button"
                                className="ingredient-name ingredient-name-button"
                                onClick={() => setNutritionOpen(true)}
                            >
                                {displayName}
                                {showChevron &&
                                    !ingredient.nutritionUnavailable && (
                                        <span
                                            className="ingredient-name-chevron"
                                            aria-hidden="true"
                                        />
                                    )}
                            </button>
                        ) : (
                            <span className="ingredient-name">
                                {displayName}
                            </span>
                        )}
                        {ingredient.nutritionUnavailable &&
                            !nutritionLookingUp && (
                                <NutritionInfo
                                    label={`Nutrition unavailable for ${displayName}`}
                                    triggerClassName="nutrition-info-button ingredient-nutrition-warning"
                                    trigger={
                                        <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                        >
                                            <path d="M12 5.5v9" />
                                            <circle cx="12" cy="18" r=".8" />
                                        </svg>
                                    }
                                >
                                    <p className="ingredient-nutrition-warning-message">
                                        Nutrition unavailable
                                    </p>
                                </NutritionInfo>
                            )}
                        {showNutritionSheet &&
                            showChevron &&
                            ingredient.nutritionUnavailable && (
                                <button
                                    type="button"
                                    className="ingredient-chevron-button"
                                    aria-label={`Open ${displayName} nutrition`}
                                    onClick={() => setNutritionOpen(true)}
                                >
                                    <span
                                        className="ingredient-name-chevron"
                                        aria-hidden="true"
                                    />
                                </button>
                            )}
                    </div>
                    <IngredientCalorieContribution
                        name={displayName}
                        calories={calories}
                        scale={calorieScale}
                    />
                </div>
                <div className="ingredient-portion-summary">
                    {weightControls ? (
                        <div className="ingredient-weight-control">
                            <button
                                type="button"
                                aria-label={`Decrease ${ingredient.name} by 5 grams`}
                                onClick={weightControls.onDecrease}
                            >
                                −
                            </button>
                            <IngredientWeightInput
                                value={weightControls.value}
                                name={ingredient.name}
                                onChange={weightControls.onChange}
                                onBlur={weightControls.onBlur}
                            />
                            <span>g</span>
                            <button
                                type="button"
                                aria-label={`Increase ${ingredient.name} by 5 grams`}
                                onClick={weightControls.onIncrease}
                            >
                                +
                            </button>
                        </div>
                    ) : (
                        <div className="ingredient-weight-control ingredient-weight-control--readonly">
                            <span className="ingredient-weight-readonly">
                                {Number(ingredient.weight.toFixed(1))} g
                            </span>
                        </div>
                    )}
                    <span className="ingredient-calorie-value">
                        {calories === undefined
                            ? '—'
                            : `${Math.round(calories)} kcal`}
                    </span>
                </div>
            </div>
            {nutritionOpen && (
                <IngredientNutritionSheet
                    ingredient={ingredient}
                    onClose={() => setNutritionOpen(false)}
                    onNutritionResolved={onNutritionResolved}
                />
            )}
        </>
    );
}
